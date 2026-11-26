package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"

	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/payroll"
	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/policy"
)

type personnelRow struct {
	ID              string
	Code            string
	Type            string
	PTKPStatus      string
	RiskClass       string
	BaseSalary      string
	FixedAllowance  string
	JoinDate        *time.Time
	TerminationDate *time.Time
}

type calculatedItem struct {
	PersonnelID string
	Result      payroll.Result
}

type attendanceRow struct {
	WorkingDays     int
	PresentDays     int
	PaidLeaveDays   int
	UnpaidLeaveDays int
	AbsentDays      int
	OvertimeHours   string
}

func (w *Worker) handleBatchCalculate(ctx context.Context, event Event) (result map[string]any, err error) {
	started := time.Now()
	ctx, span := otel.Tracer("analytics-worker-go").Start(ctx, "payroll.batch",
		trace.WithAttributes(
			attribute.String("payroll.batch_id", event.BatchID),
			attribute.String("tenant.id", event.TenantID),
		),
	)
	outcome := "success"
	defer func() {
		if err != nil {
			outcome = "error"
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
		}
		headcount := 0
		if result != nil {
			if value, ok := result["item_count"].(int); ok {
				headcount = value
			}
		}
		bucket := "small"
		if headcount > 200 {
			bucket = "large"
		} else if headcount > 50 {
			bucket = "medium"
		}
		span.SetAttributes(
			attribute.String("payroll.outcome", outcome),
			attribute.Int("payroll.headcount", headcount),
		)
		span.End()
		w.batchDuration.Record(context.Background(), time.Since(started).Seconds(), metric.WithAttributes(
			attribute.String("outcome", outcome),
			attribute.String("headcount_bucket", bucket),
		))
	}()
	var status, batchType, policyVersionID, branchID string
	var periodStart, periodEnd time.Time
	err = w.pool.QueryRow(
		ctx,
		`select status, batch_type, policy_version_id::text, branch_id::text, period_start, period_end
		   from payroll.batches
		  where tenant_id = $1 and id = $2`,
		event.TenantID,
		event.BatchID,
	).Scan(&status, &batchType, &policyVersionID, &branchID, &periodStart, &periodEnd)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("batch payroll tidak ditemukan")
		}
		return nil, err
	}
	if status != "CALCULATING" {
		return map[string]any{"batch_id": event.BatchID, "status": status, "skipped": true}, nil
	}
	if batchType != "REGULAR" && batchType != "CORRECTION" {
		return nil, fmt.Errorf("batch_type %s belum didukung oleh mesin kalkulasi", batchType)
	}

	var versionTag string
	var rulesPayload []byte
	err = w.pool.QueryRow(
		ctx,
		`select version_tag, rules_payload
		   from governance.policy_versions
		  where tenant_id = $1 and id = $2 and domain = 'PAYROLL_TAX_POLICY'`,
		event.TenantID,
		policyVersionID,
	).Scan(&versionTag, &rulesPayload)
	if err != nil {
		return nil, fmt.Errorf("policy payroll tidak ditemukan: %w", err)
	}
	rules, err := policy.Parse(rulesPayload)
	if err != nil {
		return nil, err
	}

	personnel, err := w.loadPersonnel(ctx, event.TenantID, branchID, periodStart, periodEnd)
	if err != nil {
		return nil, err
	}
	if len(personnel) == 0 {
		return nil, fmt.Errorf("tidak ada personel aktif pada cabang dan periode ini")
	}
	attendance, err := w.loadAttendance(ctx, event.TenantID, periodStart)
	if err != nil {
		return nil, err
	}
	sales, err := w.loadVerifiedSales(ctx, event.TenantID, periodStart)
	if err != nil {
		return nil, err
	}
	ytd, err := w.loadYTD(ctx, event.TenantID, periodStart)
	if err != nil {
		return nil, err
	}

	inputs := make([]payroll.Input, len(personnel))
	for index, person := range personnel {
		input := payroll.Input{
			Personnel: payroll.Personnel{
				ID:              person.ID,
				Code:            person.Code,
				Type:            person.Type,
				PTKPStatus:      person.PTKPStatus,
				RiskClass:       person.RiskClass,
				BaseSalary:      mustDecimal(person.BaseSalary),
				FixedAllowance:  mustDecimal(person.FixedAllowance),
				JoinDate:        person.JoinDate,
				TerminationDate: person.TerminationDate,
			},
			PeriodStart: periodStart,
			PeriodEnd:   periodEnd,
			YTDGross:    decimal.Zero,
			YTDTax:      decimal.Zero,
		}
		if record, ok := attendance[person.ID]; ok {
			input.Attendance = &payroll.Attendance{
				WorkingDays:     record.WorkingDays,
				PresentDays:     record.PresentDays,
				PaidLeaveDays:   record.PaidLeaveDays,
				UnpaidLeaveDays: record.UnpaidLeaveDays,
				AbsentDays:      record.AbsentDays,
				OvertimeHours:   mustDecimal(record.OvertimeHours),
			}
		}
		if amount, ok := sales[person.ID]; ok {
			input.VerifiedSales = amount
			input.HasVerifiedSales = true
		}
		if values, ok := ytd[person.ID]; ok {
			input.YTDGross = values[0]
			input.YTDTax = values[1]
		}
		inputs[index] = input
	}

	results := make([]calculatedItem, len(inputs))
	var firstErr error
	var failed bool
	var mutex sync.Mutex
	jobs := make(chan int)
	var wait sync.WaitGroup
	for workerIndex := 0; workerIndex < w.concurrency; workerIndex++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			for index := range jobs {
				mutex.Lock()
				stop := failed
				mutex.Unlock()
				if stop {
					continue
				}
				result, err := payroll.Calculate(inputs[index], rules, versionTag)
				if err != nil {
					mutex.Lock()
					if !failed {
						failed = true
						firstErr = err
					}
					mutex.Unlock()
					continue
				}
				results[index] = calculatedItem{PersonnelID: inputs[index].Personnel.ID, Result: result}
			}
		}()
	}
	for index := range inputs {
		jobs <- index
	}
	close(jobs)
	wait.Wait()
	if failed {
		w.itemFailures.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", "calculation")))
		return nil, firstErr
	}

	calculated, err := w.persistPayroll(ctx, event, versionTag, results)
	if err != nil {
		return nil, err
	}
	return calculated, nil
}

func mustDecimal(value string) decimal.Decimal {
	result, err := decimal.NewFromString(value)
	if err != nil {
		return decimal.Zero
	}
	return result
}

func (w *Worker) loadPersonnel(
	ctx context.Context,
	tenantID string,
	branchID string,
	periodStart time.Time,
	periodEnd time.Time,
) ([]personnelRow, error) {
	rows, err := w.pool.Query(
		ctx,
		`select id::text, personnel_code, personnel_type, ptkp_status, risk_class,
		        base_salary::text, fixed_allowance::text, join_date, termination_date
		   from payroll.personnel
		  where tenant_id = $1
		    and branch_id = $2
		    and is_active = true
		    and employment_status <> 'INACTIVE'
		    and join_date <= $4
		    and (termination_date is null or termination_date >= $3)
		  order by personnel_code`,
		tenantID,
		branchID,
		periodStart,
		periodEnd,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []personnelRow
	for rows.Next() {
		var row personnelRow
		if err := rows.Scan(
			&row.ID, &row.Code, &row.Type, &row.PTKPStatus, &row.RiskClass,
			&row.BaseSalary, &row.FixedAllowance, &row.JoinDate, &row.TerminationDate,
		); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func (w *Worker) loadAttendance(
	ctx context.Context,
	tenantID string,
	periodStart time.Time,
) (map[string]attendanceRow, error) {
	rows, err := w.pool.Query(
		ctx,
		`select personnel_id::text, working_days, present_days, paid_leave_days,
		        unpaid_leave_days, absent_days, overtime_hours::text
		   from payroll.attendance_summaries
		  where tenant_id = $1 and period_month = date_trunc('month', $2::date)::date`,
		tenantID,
		periodStart,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]attendanceRow{}
	for rows.Next() {
		var id string
		var row attendanceRow
		if err := rows.Scan(
			&id, &row.WorkingDays, &row.PresentDays, &row.PaidLeaveDays,
			&row.UnpaidLeaveDays, &row.AbsentDays, &row.OvertimeHours,
		); err != nil {
			return nil, err
		}
		result[id] = row
	}
	return result, rows.Err()
}

func (w *Worker) loadVerifiedSales(
	ctx context.Context,
	tenantID string,
	periodStart time.Time,
) (map[string]decimal.Decimal, error) {
	rows, err := w.pool.Query(
		ctx,
		`select personnel_id::text, verified_sales::text
		   from payroll.sales_achievements
		  where tenant_id = $1
		    and period_month = date_trunc('month', $2::date)::date
		    and verification_status = 'VERIFIED'`,
		tenantID,
		periodStart,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]decimal.Decimal{}
	for rows.Next() {
		var id, amount string
		if err := rows.Scan(&id, &amount); err != nil {
			return nil, err
		}
		result[id] = mustDecimal(amount)
	}
	return result, rows.Err()
}

func (w *Worker) loadYTD(
	ctx context.Context,
	tenantID string,
	periodStart time.Time,
) (map[string][2]decimal.Decimal, error) {
	rows, err := w.pool.Query(
		ctx,
		`select i.personnel_id::text,
		        coalesce(sum(i.gross_income), 0)::text,
		        coalesce(sum(i.pph21_tax_deduction), 0)::text
		   from payroll.items i
		   join payroll.batches b
		     on b.id = i.batch_id and b.tenant_id = i.tenant_id
		  where i.tenant_id = $1
		    and b.period_month >= date_trunc('year', $2::date)::date
		    and b.period_month < date_trunc('month', $2::date)::date
		  group by i.personnel_id`,
		tenantID,
		periodStart,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string][2]decimal.Decimal{}
	for rows.Next() {
		var id, gross, tax string
		if err := rows.Scan(&id, &gross, &tax); err != nil {
			return nil, err
		}
		result[id] = [2]decimal.Decimal{mustDecimal(gross), mustDecimal(tax)}
	}
	return result, rows.Err()
}

func (w *Worker) persistPayroll(
	ctx context.Context,
	event Event,
	versionTag string,
	results []calculatedItem,
) (map[string]any, error) {
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var status string
	if err := tx.QueryRow(
		ctx,
		`select status from payroll.batches
		  where tenant_id = $1 and id = $2
		  for update`,
		event.TenantID,
		event.BatchID,
	).Scan(&status); err != nil {
		return nil, err
	}
	if status != "CALCULATING" {
		return map[string]any{"batch_id": event.BatchID, "status": status, "skipped": true}, nil
	}
	if _, err := tx.Exec(
		ctx,
		`delete from payroll.items where tenant_id = $1 and batch_id = $2`,
		event.TenantID,
		event.BatchID,
	); err != nil {
		return nil, err
	}

	insertSQL := `insert into payroll.items
	  (id, tenant_id, batch_id, personnel_id, gross_income, variable_allowance, overtime_pay,
	   agent_commission, unpaid_leave_deduction, absence_deduction, bpjs_kesehatan_deduction,
	   bpjs_ketenagakerjaan_deduction, bpjs_jht_deduction, bpjs_jp_deduction,
	   bpjs_kesehatan_employer, bpjs_jht_employer, bpjs_jp_employer, bpjs_jkk_employer,
	   bpjs_jkm_employer, pph21_tax_deduction, net_take_home_pay, taxable_income,
	   ytd_gross, ytd_tax, payment_status, calculation_breakdown)
	 values (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
	         $17,$18,$19,$20,$21,$22,$23,'PENDING',$24)`
	batch := &pgx.Batch{}
	var totalGross, totalTax, totalEmployeeBPJS, totalEmployerBPJS, totalNet decimal.Decimal
	for _, item := range results {
		result := item.Result
		breakdown, err := json.Marshal(result.Breakdown)
		if err != nil {
			return nil, err
		}
		employeeBPJS := result.BPJSKesehatanDeduction.Add(result.BPJSKetenagakerjaanDeduction)
		employerBPJS := result.BPJSKesehatanEmployer.
			Add(result.BPJSJHTEmployer).
			Add(result.BPJSJPEmployer).
			Add(result.BPJSJKKEmployer).
			Add(result.BPJSJKMEmployer)
		totalGross = totalGross.Add(result.GrossIncome)
		totalTax = totalTax.Add(result.PPH21TaxDeduction)
		totalEmployeeBPJS = totalEmployeeBPJS.Add(employeeBPJS)
		totalEmployerBPJS = totalEmployerBPJS.Add(employerBPJS)
		totalNet = totalNet.Add(result.NetTakeHomePay)
		batch.Queue(
			insertSQL,
			event.TenantID,
			event.BatchID,
			item.PersonnelID,
			result.GrossIncome.StringFixed(2),
			result.VariableAllowance.StringFixed(2),
			result.OvertimePay.StringFixed(2),
			result.AgentCommission.StringFixed(2),
			result.UnpaidLeaveDeduction.StringFixed(2),
			result.AbsenceDeduction.StringFixed(2),
			result.BPJSKesehatanDeduction.StringFixed(2),
			result.BPJSKetenagakerjaanDeduction.StringFixed(2),
			result.BPJSJHTDeduction.StringFixed(2),
			result.BPJSJPDeduction.StringFixed(2),
			result.BPJSKesehatanEmployer.StringFixed(2),
			result.BPJSJHTEmployer.StringFixed(2),
			result.BPJSJPEmployer.StringFixed(2),
			result.BPJSJKKEmployer.StringFixed(2),
			result.BPJSJKMEmployer.StringFixed(2),
			result.PPH21TaxDeduction.StringFixed(2),
			result.NetTakeHomePay.StringFixed(2),
			result.TaxableIncome.StringFixed(2),
			result.YTDGross.StringFixed(2),
			result.YTDTax.StringFixed(2),
			breakdown,
		)
	}
	batchResults := tx.SendBatch(ctx, batch)
	for range results {
		if _, err := batchResults.Exec(); err != nil {
			_ = batchResults.Close()
			return nil, err
		}
	}
	if err := batchResults.Close(); err != nil {
		return nil, err
	}

	if _, err := tx.Exec(
		ctx,
		`update payroll.batches
		    set status = 'READY_FOR_APPROVAL',
		        total_gross_amount = $3,
		        total_tax_pph21 = $4,
		        total_bpjs_deduction = $5,
		        total_bpjs_employer = $6,
		        headcount = $7,
		        calculated_at = now(),
		        calculation_version = 'v1'
		  where tenant_id = $1 and id = $2`,
		event.TenantID,
		event.BatchID,
		totalGross.StringFixed(2),
		totalTax.StringFixed(2),
		totalEmployeeBPJS.StringFixed(2),
		totalEmployerBPJS.StringFixed(2),
		len(results),
	); err != nil {
		return nil, err
	}

	if err := w.appendAudit(
		ctx,
		tx,
		event.TenantID,
		event.CorrelationID,
		"PAYROLL",
		"PAYROLL_BATCH",
		event.BatchID,
		"BATCH_CALCULATED",
		event.PolicyVersionID,
		map[string]any{
			"policy_version_tag": versionTag,
			"item_count":         len(results),
			"total_gross":        totalGross.StringFixed(2),
			"total_net":          totalNet.StringFixed(2),
		},
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return map[string]any{
		"batch_id":       event.BatchID,
		"status":         "READY_FOR_APPROVAL",
		"item_count":     len(results),
		"total_gross":    totalGross.StringFixed(2),
		"total_net":      totalNet.StringFixed(2),
		"policy_version": versionTag,
	}, nil
}
