package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/payroll"
	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/policy"
)

func (w *Worker) handleWhatIf(ctx context.Context, event Event) (map[string]any, error) {
	if event.SimulationName == "" {
		return nil, fmt.Errorf("simulation_name wajib diisi")
	}
	periodStart, err := time.Parse("2006-01-02", event.TargetPeriodStart)
	if err != nil {
		return nil, fmt.Errorf("target_period_start tidak valid: %w", err)
	}
	periodEnd, err := time.Parse("2006-01-02", event.TargetPeriodEnd)
	if err != nil {
		return nil, fmt.Errorf("target_period_end tidak valid: %w", err)
	}
	policyVersionID := event.BasePolicyVersionID
	if policyVersionID == "" {
		policyVersionID = event.PolicyVersionID
	}
	if policyVersionID == "" {
		return nil, fmt.Errorf("base_policy_version_id wajib diisi")
	}

	var basePayload []byte
	if err := w.pool.QueryRow(
		ctx,
		`select rules_payload
		   from governance.policy_versions
		  where tenant_id = $1 and id = $2 and domain = 'PAYROLL_TAX_POLICY'`,
		event.TenantID,
		policyVersionID,
	).Scan(&basePayload); err != nil {
		return nil, fmt.Errorf("policy dasar tidak ditemukan: %w", err)
	}
	baseRules, err := policy.Parse(basePayload)
	if err != nil {
		return nil, err
	}
	simulatedRules := *baseRules
	simulatedPayload := event.SimulatedRules
	if len(simulatedPayload) > 0 {
		var overrides map[string]json.RawMessage
		if err := json.Unmarshal(simulatedPayload, &overrides); err != nil {
			return nil, fmt.Errorf("simulated_rules_payload tidak valid: %w", err)
		}
		for key, raw := range overrides {
			switch key {
			case "agent_commission_tiers":
				var tiers []policy.CommissionTier
				if err := json.Unmarshal(raw, &tiers); err != nil {
					return nil, err
				}
				simulatedRules.AgentCommissionTiers = tiers
			case "commission_mode":
				if err := json.Unmarshal(raw, &simulatedRules.CommissionMode); err != nil {
					return nil, err
				}
			default:
				return nil, fmt.Errorf("override what-if %s belum didukung", key)
			}
		}
	}

	readTx, err := w.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer func() { _ = readTx.Rollback(ctx) }()

	var actualTotalText, actualCommissionText string
	if err := readTx.QueryRow(
		ctx,
		`select coalesce(sum(i.gross_income), 0)::text,
		        coalesce(sum(i.agent_commission), 0)::text
		   from payroll.items i
		   join payroll.batches b on b.id = i.batch_id and b.tenant_id = i.tenant_id
		  where i.tenant_id = $1
		    and b.period_month >= date_trunc('month', $2::date)::date
		    and b.period_month < date_trunc('month', $3::date)::date + interval '1 month'
		    and (nullif($4, '') is null or b.branch_id = nullif($4, '')::uuid)`,
		event.TenantID,
		periodStart,
		periodEnd,
		event.BranchID,
	).Scan(&actualTotalText, &actualCommissionText); err != nil {
		return nil, err
	}
	actualTotal := mustDecimal(actualTotalText)
	actualCommission := mustDecimal(actualCommissionText)

	rows, err := readTx.Query(
		ctx,
		`select s.personnel_id::text, sum(s.verified_sales)::text
		   from payroll.sales_achievements s
		   join payroll.personnel p on p.id = s.personnel_id and p.tenant_id = s.tenant_id
		  where s.tenant_id = $1
		    and s.verification_status = 'VERIFIED'
		    and s.period_month >= date_trunc('month', $2::date)::date
		    and s.period_month < date_trunc('month', $3::date)::date + interval '1 month'
		    and (nullif($4, '') is null or p.branch_id = nullif($4, '')::uuid)
		  group by s.personnel_id`,
		event.TenantID,
		periodStart,
		periodEnd,
		event.BranchID,
	)
	if err != nil {
		return nil, err
	}
	simulatedCommission := decimal.Zero
	agentCount := 0
	for rows.Next() {
		var personnelID, salesText string
		if err := rows.Scan(&personnelID, &salesText); err != nil {
			rows.Close()
			return nil, err
		}
		amount, err := payroll.CalculateCommission(mustDecimal(salesText), &simulatedRules)
		if err != nil {
			rows.Close()
			return nil, err
		}
		simulatedCommission = simulatedCommission.Add(amount)
		agentCount++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := readTx.Commit(ctx); err != nil {
		return nil, err
	}

	simulatedTotal := actualTotal.Sub(actualCommission).Add(simulatedCommission)
	varianceAmount := simulatedTotal.Sub(actualTotal)
	variancePercentage := decimal.Zero
	if !actualTotal.IsZero() {
		variancePercentage = varianceAmount.Div(actualTotal).Mul(decimal.NewFromInt(100)).Round(4)
	}
	if len(simulatedPayload) == 0 {
		simulatedPayload = basePayload
	}
	impactBreakdown := map[string]any{
		"actual_commission":    actualCommission.StringFixed(2),
		"simulated_commission": simulatedCommission.StringFixed(2),
		"agent_count":          agentCount,
	}
	impactPayload, _ := json.Marshal(impactBreakdown)

	writeTx, err := w.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = writeTx.Rollback(ctx) }()
	var simulationID string
	if err := writeTx.QueryRow(
		ctx,
		`insert into analytics.what_if_simulations
		  (id, tenant_id, simulation_name, base_policy_version_id, simulated_rules_payload,
		   target_period_start, target_period_end, actual_total_cost, simulated_total_cost,
		   variance_amount, variance_percentage, impact_breakdown, created_by)
		 values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 returning id::text`,
		event.TenantID,
		event.SimulationName,
		policyVersionID,
		simulatedPayload,
		periodStart,
		periodEnd,
		actualTotal.StringFixed(2),
		simulatedTotal.StringFixed(2),
		varianceAmount.StringFixed(2),
		variancePercentage.StringFixed(4),
		impactPayload,
		event.RequestedBy,
	).Scan(&simulationID); err != nil {
		return nil, err
	}
	if err := w.appendAudit(
		ctx,
		writeTx,
		event.TenantID,
		event.CorrelationID,
		"ANALYTICS",
		"WHAT_IF_SIMULATION",
		simulationID,
		"WHAT_IF_SIMULATION_RUN",
		policyVersionID,
		map[string]any{
			"actual_total_cost":    actualTotal.StringFixed(2),
			"simulated_total_cost": simulatedTotal.StringFixed(2),
			"variance_amount":      varianceAmount.StringFixed(2),
			"branch_id":            event.BranchID,
		},
	); err != nil {
		return nil, err
	}
	if err := writeTx.Commit(ctx); err != nil {
		return nil, err
	}
	return map[string]any{
		"simulation_id":        simulationID,
		"actual_total_cost":    actualTotal.StringFixed(2),
		"simulated_total_cost": simulatedTotal.StringFixed(2),
		"variance_amount":      varianceAmount.StringFixed(2),
		"variance_percentage":  variancePercentage.StringFixed(4),
	}, nil
}

func (w *Worker) handleMISRefresh(ctx context.Context, event Event) (map[string]any, error) {
	if _, err := w.pool.Exec(ctx, `refresh materialized view concurrently analytics.mis_monthly_kpi`); err != nil {
		return nil, err
	}
	return map[string]any{"refreshed": true, "tenant_id": event.TenantID}, nil
}
