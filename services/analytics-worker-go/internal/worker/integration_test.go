package worker

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	testTenant          = "019361a2-7c00-7000-8000-000000000951"
	testBranch          = "019361a2-7c00-7000-8000-000000000952"
	testHR              = "019361a2-7c00-7000-8000-000000000953"
	testFinance         = "019361a2-7c00-7000-8000-000000000954"
	testPayrollPolicy   = "019361a2-7c00-7000-8000-000000000955"
	testClaimsPolicy    = "019361a2-7c00-7000-8000-000000000956"
	testClaimsThreshold = "019361a2-7c00-7000-8000-000000000957"
	testBulkBranch      = "019361a2-7c00-7000-8000-000000000958"
	testCostPolicy      = "019361a2-7c00-7000-8000-000000000959"
	testSiti            = "019361a2-7c00-7000-8000-000000000960"
	testBudi            = "019361a2-7c00-7000-8000-000000000961"
	testAgus            = "019361a2-7c00-7000-8000-000000000962"
	testBatch           = "019361a2-7c00-7000-8000-000000000970"
	testBulkBatch       = "019361a2-7c00-7000-8000-000000000971"
	testClaimClean      = "019361a2-7c00-7000-8000-000000000980"
	testClaimConflict   = "019361a2-7c00-7000-8000-000000000981"
	testClaimThreshold  = "019361a2-7c00-7000-8000-000000000982"
	testCorrelation     = "019361a2-7c00-7000-8000-000000000990"
)

const payrollPolicyJSON = `{
  "bpjs_parameters": {
    "kesehatan_employee_rate": "0.0100",
    "kesehatan_salary_cap": "12000000.00",
    "jht_employee_rate": "0.0200",
    "jht_salary_cap": null,
    "jp_employee_rate": "0.0100",
    "jp_salary_cap": "10042300.00",
    "bpjs_wage_base_components": ["base_salary", "fixed_allowance"],
    "agent_bpjs_applicable": false
  },
  "pph21_ter_mapping": {
    "CATEGORY_A": ["TK/0", "TK/1", "K/0"],
    "CATEGORY_B": ["TK/2", "TK/3", "K/1", "K/2"],
    "CATEGORY_C": ["K/3"]
  },
  "ter_base_components": ["base_salary", "fixed_allowance", "variable_allowance", "overtime_pay", "agent_commission"],
  "ter_base_exclusions": [],
  "pph21_ter_brackets": {
    "CATEGORY_A": [
      {"max_gross": "5400000.00", "rate": "0.0000"},
      {"max_gross": "999999999999.00", "rate": "0.1500"}
    ],
    "CATEGORY_B": [
      {"max_gross": "6200000.00", "rate": "0.0000"},
      {"max_gross": "999999999999.00", "rate": "0.1500"}
    ],
    "CATEGORY_C": [
      {"max_gross": "6600000.00", "rate": "0.0000"},
      {"max_gross": "999999999999.00", "rate": "0.1500"}
    ]
  },
  "pph21_annual_brackets": [
    {"max_pkp": "60000000.00", "rate": "0.0500"},
    {"max_pkp": "250000000.00", "rate": "0.1500"},
    {"max_pkp": "500000000.00", "rate": "0.2500"},
    {"max_pkp": "5000000000.00", "rate": "0.3000"},
    {"max_pkp": "999999999999.00", "rate": "0.3500"}
  ],
  "agent_commission_tiers": [
    {"min_sales": "0.00", "max_sales": "50000000.00", "commission_rate": "0.0250"},
    {"min_sales": "50000000.01", "max_sales": "150000000.00", "commission_rate": "0.0400"},
    {"min_sales": "150000000.01", "max_sales": "999999999999.00", "commission_rate": "0.0550"}
  ],
  "commission_mode": "FLAT_TIER",
  "bpjs_employer_rates": {
    "kesehatan_employer_rate": "0.0400",
    "jht_employer_rate": "0.0370",
    "jp_employer_rate": "0.0200",
    "jkk_rate_by_risk_class": {
      "I": "0.0024",
      "II": "0.0054",
      "III": "0.0089",
      "IV": "0.0127",
      "V": "0.0174"
    },
    "jkm_rate": "0.0030"
  },
  "ptkp_amounts": {
    "TK/0": "54000000.00",
    "TK/1": "58500000.00",
    "TK/2": "63000000.00",
    "TK/3": "67500000.00",
    "K/0": "58500000.00",
    "K/1": "63000000.00",
    "K/2": "67500000.00",
    "K/3": "72000000.00"
  },
  "annual_deductions": {
    "biaya_jabatan_rate": "0.0500",
    "biaya_jabatan_max_annual": "6000000.00",
    "deductible_employee_contributions": ["JHT", "JP"]
  },
  "reconciliation_posting_period": "DECEMBER",
  "overpayment_treatment": "REFUND_OR_CREDIT",
  "negative_net_policy": "REJECT",
  "tax_remittance_rounding": 0,
  "prorate_fixed_allowance": true,
  "attendance": {
    "proration_basis": "working_days",
    "daily_rate_basis": "base_salary/working_days",
    "hourly_rate_basis": "base_salary/(working_days*8)",
    "overtime_first_hour_multiplier": "1.5000",
    "overtime_subsequent_multiplier": "2.0000",
    "overtime_rest_day_multiplier": "2.0000",
    "max_overtime_hours_per_month": 40
  }
}`

const claimsPolicyJSON = `{
  "approval_tiers": {
    "level_1_branch_manager_max": "25000000.00",
    "level_2_finance_manager_max": "150000000.00",
    "auto_escalate_risk_threshold": 65,
    "force_escalate_on_conflict": true
  },
  "required_documents_by_category": {
    "HEALTH": ["IDENTITY_CARD", "MEDICAL_INVOICE"]
  },
  "optional_documents_by_category": {
    "HEALTH": ["POLICY_CERT"]
  },
  "risk_scoring_weights": {
    "missing_optional_evidence_points": 15,
    "high_amount_ratio_threshold": 0.8,
    "high_amount_ratio_points": 50,
    "repeat_bank_account_30d_points": 30,
    "cross_domain_conflict_points": 50
  }
}`

const costPolicyJSON = `{
  "bjo_rate": "0.0250",
  "management_fee_rate": "0.0500",
  "invoice_rounding": "UP_1000"
}`

func integrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if os.Getenv("RUN_WORKER_INTEGRATION") != "true" {
		t.Skip("RUN_WORKER_INTEGRATION bukan true")
	}
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgresql://aletheia:aletheia@localhost:55432/aletheia"
	}
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		t.Fatalf("pool gagal: %v", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Fatalf("database tidak dapat dijangkau: %v", err)
	}
	return pool
}

func mustExec(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("exec gagal: %v\nsql: %s", err, sql)
	}
}

func cleanupTenant(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	statements := []string{
		`delete from analytics.anomaly_flags where tenant_id = $1`,
		`delete from claims.documents where tenant_id = $1`,
		`delete from claims.approval_steps where tenant_id = $1`,
		`delete from claims.disbursements where tenant_id = $1`,
		`delete from claims.submissions where tenant_id = $1`,
		`delete from payroll.generated_files where tenant_id = $1`,
		`delete from payroll.payment_webhook_events where tenant_id = $1`,
		`delete from payroll.payments where tenant_id = $1`,
		`delete from payroll.payslips where tenant_id = $1`,
		`delete from payroll.tax_reports where tenant_id = $1`,
		`delete from payroll.tax_reconciliations where tenant_id = $1`,
		`delete from payroll.items where tenant_id = $1`,
		`delete from payroll.batches where tenant_id = $1`,
		`delete from payroll.leave_requests where tenant_id = $1`,
		`delete from payroll.attendance_summaries where tenant_id = $1`,
		`delete from payroll.sales_achievements where tenant_id = $1`,
		`delete from analytics.what_if_simulations where tenant_id = $1`,
		`delete from payroll.personnel where tenant_id = $1`,
		`delete from governance.policy_versions where tenant_id = $1`,
		`delete from governance.idempotency_records where tenant_id = $1`,
		`delete from governance.users where tenant_id = $1`,
	}
	for _, statement := range statements {
		if _, err := pool.Exec(ctx, statement, testTenant); err != nil {
			t.Fatalf("cleanup gagal: %v\nsql: %s", err, statement)
		}
	}
}

func seedTenant(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	mustExec(t, pool,
		`insert into governance.tenants (id, code, name, status)
		 values ($1, 'M32', 'M3.2 Worker Tenant', 'ACTIVE')
		 on conflict (id) do update set name = excluded.name`,
		testTenant,
	)
	mustExec(t, pool,
		`insert into governance.branches (id, tenant_id, code, name, region, monthly_disbursement_cap)
		 values ($1, $2, 'M32-01', 'M3.2 Branch', 'Test', '1000000000.00')
		 on conflict (id) do update set name = excluded.name`,
		testBranch,
		testTenant,
	)
	mustExec(t, pool,
		`insert into governance.users
		   (id, tenant_id, branch_id, employee_number, full_name, email, password_hash, role, is_active)
		 values ($1,$2,$3,'M32-01','Worker HR','hr@m32.test',$4,'HR_SPECIALIST',true),
		        ($5,$2,$3,'M32-02','Worker Finance','finance@m32.test',$4,'FINANCE_MANAGER',true)
		 on conflict (id) do nothing`,
		testHR,
		testTenant,
		testBranch,
		"x",
		testFinance,
	)
	mustExec(t, pool,
		`insert into governance.policy_versions
		   (id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
		    effective_from, published_by, approved_by)
		 values ($1,$2,'PAYROLL_TAX_POLICY','v2026.11.worker','ACTIVE',$3,repeat('a',64),
		         '2026-11-01T00:00:00Z',$4,$5),
		        ($6,$2,'CLAIMS_POLICY','v2026.11.worker','ACTIVE',$7,repeat('b',64),
		         '2026-11-01T00:00:00Z',$4,$5)`,
		testPayrollPolicy,
		testTenant,
		payrollPolicyJSON,
		testHR,
		testFinance,
		testClaimsPolicy,
		claimsPolicyJSON,
	)
	mustExec(t, pool,
		`insert into governance.policy_versions
		   (id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
		    effective_from, published_by, approved_by)
		 values ($1,$2,'PAYROLL_COST_POLICY','v2026.11.cost.worker','ACTIVE',$3,repeat('c',64),
		         '2026-11-01T00:00:00Z',$4,$5)`,
		testCostPolicy,
		testTenant,
		costPolicyJSON,
		testHR,
		testFinance,
	)

	hashes := func(seed string) string {
		result := ""
		for len(result) < 64 {
			result += seed
		}
		return result[:64]
	}

	personnel := []struct {
		id, code, kind, name, ptkp, risk, base, allowance, joinDate, status string
	}{
		{testSiti, "EMP-M32-001", "EMPLOYEE", "Siti Worker", "K/1", "II", "9000000.00", "2000000.00", "2024-01-15", "PERMANENT"},
		{testBudi, "EMP-M32-002", "EMPLOYEE", "Budi Worker", "TK/0", "I", "7000000.00", "1000000.00", "2025-02-01", "PERMANENT"},
		{testAgus, "AGT-M32-001", "SALES_AGENT", "Agus Worker", "TK/0", "I", "4500000.00", "0.00", "2025-03-01", "CONTRACT"},
	}
	for index, person := range personnel {
		mustExec(t, pool,
			`insert into payroll.personnel
			   (id, tenant_id, branch_id, personnel_code, personnel_type, full_name,
			    nik_hash, nik_masked, bank_account_hash, bank_account_masked, bank_code, bank_name,
			    ptkp_status, risk_class, employment_status, base_salary, fixed_allowance, join_date, is_active)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'BCA','Bank Central Asia',$11,$12,$13,$14,$15,$16,true)`,
			person.id,
			testTenant,
			testBranch,
			person.code,
			person.kind,
			person.name,
			hashes(string(rune('a'+index))),
			"3273********000"+string(rune('1'+index)),
			hashes(string(rune('d'+index))),
			"******000"+string(rune('1'+index)),
			person.ptkp,
			person.risk,
			person.status,
			person.base,
			person.allowance,
			person.joinDate,
		)
	}

	for _, personnelID := range []string{testSiti, testBudi} {
		mustExec(t, pool,
			`insert into payroll.attendance_summaries
			   (id, tenant_id, personnel_id, period_month, working_days, present_days,
			    paid_leave_days, unpaid_leave_days, absent_days, overtime_hours, source)
			 values (gen_random_uuid(),$1,$2,'2026-11-01',22,22,0,0,0,0,'MANUAL')`,
			testTenant,
			personnelID,
		)
	}
	mustExec(t, pool,
		`insert into payroll.sales_achievements
		   (id, tenant_id, personnel_id, period_month, verified_sales, verification_status,
		    source, verified_by, verified_at)
		 values (gen_random_uuid(),$1,$2,'2026-11-01','60000000.00','VERIFIED','MANUAL',$3,now())`,
		testTenant,
		testAgus,
		testHR,
	)
	mustExec(t, pool,
		`insert into payroll.batches
		   (id, tenant_id, batch_code, branch_id, period_month, batch_type, correction_seq,
		    period_start, period_end, policy_version_id, status, created_by, idempotency_key)
		 values ($1,$2,'PAY-M32-202611-01',$3,'2026-11-01','REGULAR',0,
		         '2026-11-01','2026-11-30',$4,'CALCULATING',$5,'m32-batch')`,
		testBatch,
		testTenant,
		testBranch,
		testPayrollPolicy,
		testHR,
	)

	claims := []struct {
		id, number, bankHash, nikHash, policy, amount string
	}{
		{testClaimClean, "CLM-M32-001", hashes("k"), hashes("l"), testClaimsPolicy, "5000000.00"},
		{testClaimConflict, "CLM-M32-002", hashes("d"), hashes("n"), testClaimsPolicy, "5000000.00"},
		{testClaimThreshold, "CLM-M32-003", hashes("p"), hashes("q"), testClaimsPolicy, "20000000.00"},
	}
	for _, claim := range claims {
		mustExec(t, pool,
			`insert into claims.submissions
			   (id, tenant_id, claim_number, branch_id, policy_version_id, claimant_name,
			    claimant_nik_hash, claimant_nik_masked, bank_account_hash, bank_account_masked,
			    claim_category, requested_amount, status, created_by, idempotency_key, submitted_at)
			 values ($1,$2,$3,$4,$5,'Worker Claimant',$6,'3273********9999',$7,'******9999',
			         'HEALTH',$8,'SUBMITTED',$9,$10,now())`,
			claim.id,
			testTenant,
			claim.number,
			testBranch,
			claim.policy,
			claim.nikHash,
			claim.bankHash,
			claim.amount,
			testHR,
			"m32-"+claim.number,
		)
	}
	mustExec(t, pool,
		`insert into claims.documents
		   (id, tenant_id, claim_id, document_type, cloudinary_public_id, secure_url,
		    mime_type, file_size_bytes, uploaded_by)
		 values (gen_random_uuid(),$1,$2,'POLICY_CERT','worker/cert','https://example.test/cert.pdf',
		         'application/pdf',1024,$3)`,
		testTenant,
		testClaimConflict,
		testHR,
	)
}

func newTestWorker(t *testing.T, pool *pgxpool.Pool) *Worker {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))
	return New(pool, logger, 4)
}

func TestIntegrationBatchCalculate(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	cleanupTenant(t, pool)
	seedTenant(t, pool)
	analyticsWorker := newTestWorker(t, pool)

	event := Event{
		EventID:         "019361a2-7c00-7000-8000-000000000991",
		EventType:       EventBatchCalculate,
		TenantID:        testTenant,
		CorrelationID:   testCorrelation,
		RequestedBy:     testHR,
		BatchID:         testBatch,
		PolicyVersionID: testPayrollPolicy,
	}
	result, err := analyticsWorker.Handle(context.Background(), event)
	if err != nil {
		t.Fatalf("batch calculate gagal: %v", err)
	}
	if result["status"] != "READY_FOR_APPROVAL" {
		t.Fatalf("status tidak sesuai: %v", result["status"])
	}

	var status, gross, tax, bpjsEmployee, bpjsEmployer, net string
	var headcount int
	if err := pool.QueryRow(
		context.Background(),
		`select status, total_gross_amount::text, total_tax_pph21::text,
		        total_bpjs_deduction::text, total_bpjs_employer::text,
		        total_net_disbursed::text, headcount
		   from payroll.batches where tenant_id = $1 and id = $2`,
		testTenant,
		testBatch,
	).Scan(&status, &gross, &tax, &bpjsEmployee, &bpjsEmployer, &net, &headcount); err != nil {
		t.Fatal(err)
	}
	if status != "READY_FOR_APPROVAL" {
		t.Fatalf("status batch %s", status)
	}
	expected := map[string]string{
		"gross":        "25900000.00",
		"tax":          "3885000.00",
		"bpjsEmployee": "750423.00",
		"bpjsEmployer": "1959446.00",
	}
	if gross != expected["gross"] || tax != expected["tax"] ||
		bpjsEmployee != expected["bpjsEmployee"] || bpjsEmployer != expected["bpjsEmployer"] {
		t.Fatalf("total batch tidak sesuai: gross=%s tax=%s bpjs=%s employer=%s", gross, tax, bpjsEmployee, bpjsEmployer)
	}
	if net != "0.00" {
		t.Fatalf("total_net_disbursed harus tetap 0 sebelum pencairan, dapat %s", net)
	}
	if headcount != 3 {
		t.Fatalf("headcount %d", headcount)
	}

	rows, err := pool.Query(
		context.Background(),
		`select personnel_id::text, net_take_home_pay::text, pph21_tax_deduction::text,
		        bpjs_kesehatan_deduction::text, bpjs_jp_deduction::text, agent_commission::text
		   from payroll.items where tenant_id = $1 and batch_id = $2 order by personnel_id`,
		testTenant,
		testBatch,
	)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	items := map[string][5]string{}
	for rows.Next() {
		var id string
		var values [5]string
		if err := rows.Scan(&id, &values[0], &values[1], &values[2], &values[3], &values[4]); err != nil {
			t.Fatal(err)
		}
		items[id] = values
	}
	if len(items) != 3 {
		t.Fatalf("item count %d", len(items))
	}
	if items[testSiti][0] != "8919577.00" {
		t.Fatalf("net Siti %s", items[testSiti][0])
	}
	if items[testBudi][0] != "6480000.00" {
		t.Fatalf("net Budi %s", items[testBudi][0])
	}
	if items[testAgus][0] != "5865000.00" {
		t.Fatalf("net Agus %s", items[testAgus][0])
	}
	if items[testAgus][4] != "2400000.00" {
		t.Fatalf("komisi Agus %s", items[testAgus][4])
	}
	if items[testSiti][3] != "100423.00" {
		t.Fatalf("JP Siti %s", items[testSiti][3])
	}

	var auditCount int
	if err := pool.QueryRow(
		context.Background(),
		`select count(*) from governance.audit_logs
		  where tenant_id = $1 and entity_id = $2 and action = 'BATCH_CALCULATED'`,
		testTenant,
		testBatch,
	).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount < 1 {
		t.Fatalf("audit BATCH_CALCULATED %d", auditCount)
	}
	auditBefore := auditCount

	replay, err := analyticsWorker.Handle(context.Background(), event)
	if err != nil {
		t.Fatalf("replay gagal: %v", err)
	}
	if replay["skipped"] != true {
		t.Fatalf("replay harus skipped: %v", replay)
	}
	if err := pool.QueryRow(
		context.Background(),
		`select count(*) from payroll.items where tenant_id = $1 and batch_id = $2`,
		testTenant,
		testBatch,
	).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount != 3 {
		t.Fatalf("replay mengubah item count %d", auditCount)
	}
	if err := pool.QueryRow(
		context.Background(),
		`select count(*) from governance.audit_logs
		  where tenant_id = $1 and entity_id = $2 and action = 'BATCH_CALCULATED'`,
		testTenant,
		testBatch,
	).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount != auditBefore {
		t.Fatalf("replay menambah audit %d menjadi %d", auditBefore, auditCount)
	}
}

func TestIntegrationWhatIfIsReadOnly(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	cleanupTenant(t, pool)
	seedTenant(t, pool)
	analyticsWorker := newTestWorker(t, pool)

	batchEvent := Event{
		EventID:       "019361a2-7c00-7000-8000-000000000992",
		EventType:     EventBatchCalculate,
		TenantID:      testTenant,
		CorrelationID: testCorrelation,
		RequestedBy:   testHR,
		BatchID:       testBatch,
	}
	if _, err := analyticsWorker.Handle(context.Background(), batchEvent); err != nil {
		t.Fatalf("batch calculate gagal: %v", err)
	}

	snapshot := func() string {
		var value string
		if err := pool.QueryRow(
			context.Background(),
			`select count(*)::text || ':' || coalesce(sum(net_take_home_pay),0)::text || ':' ||
			        coalesce(sum(gross_income),0)::text
			   from payroll.items where tenant_id = $1`,
			testTenant,
		).Scan(&value); err != nil {
			t.Fatal(err)
		}
		var claims string
		if err := pool.QueryRow(
			context.Background(),
			`select count(*)::text || ':' || coalesce(sum(requested_amount),0)::text
			   from claims.submissions where tenant_id = $1`,
			testTenant,
		).Scan(&claims); err != nil {
			t.Fatal(err)
		}
		return value + "|" + claims
	}
	before := snapshot()

	simulated, _ := json.Marshal(map[string]any{
		"agent_commission_tiers": []map[string]string{
			{"min_sales": "0.00", "max_sales": "50000000.00", "commission_rate": "0.0375"},
			{"min_sales": "50000000.01", "max_sales": "150000000.00", "commission_rate": "0.0600"},
			{"min_sales": "150000000.01", "max_sales": "999999999999.00", "commission_rate": "0.0825"},
		},
	})
	event := Event{
		EventID:             "019361a2-7c00-7000-8000-000000000993",
		EventType:           EventWhatIf,
		TenantID:            testTenant,
		CorrelationID:       testCorrelation,
		RequestedBy:         testHR,
		SimulationName:      "Komisi plus lima puluh persen",
		BasePolicyVersionID: testPayrollPolicy,
		SimulatedRules:      simulated,
		TargetPeriodStart:   "2026-11-01",
		TargetPeriodEnd:     "2026-11-30",
		BranchID:            testBranch,
	}
	result, err := analyticsWorker.Handle(context.Background(), event)
	if err != nil {
		t.Fatalf("what-if gagal: %v", err)
	}
	if result["simulated_total_cost"] != "27100000.00" {
		t.Fatalf("simulated total %v", result["simulated_total_cost"])
	}
	if result["variance_amount"] != "1200000.00" {
		t.Fatalf("variance %v", result["variance_amount"])
	}
	event.BranchID = ""
	event.EventID = "019361a2-7c00-7000-8000-000000000997"
	if _, err := analyticsWorker.Handle(context.Background(), event); err != nil {
		t.Fatalf("what-if tanpa cabang gagal: %v", err)
	}
	if snapshot() != before {
		t.Fatal("what-if mengubah data payroll atau claims")
	}
	var simulationCount int
	if err := pool.QueryRow(
		context.Background(),
		`select count(*) from analytics.what_if_simulations where tenant_id = $1`,
		testTenant,
	).Scan(&simulationCount); err != nil {
		t.Fatal(err)
	}
	if simulationCount != 2 {
		t.Fatalf("simulation count %d", simulationCount)
	}
}

func TestIntegrationClaimRiskRouting(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	cleanupTenant(t, pool)
	seedTenant(t, pool)
	analyticsWorker := newTestWorker(t, pool)

	riskEvent := func(id string) Event {
		return Event{
			EventID:       "019361a2-7c00-7000-8000-00000000099" + id[len(id)-1:],
			EventType:     EventClaimRisk,
			TenantID:      testTenant,
			CorrelationID: testCorrelation,
			ClaimID:       id,
		}
	}

	if _, err := analyticsWorker.Handle(context.Background(), riskEvent(testClaimClean)); err != nil {
		t.Fatalf("risk clean gagal: %v", err)
	}
	var status string
	var score int
	if err := pool.QueryRow(
		context.Background(),
		`select status, risk_score from claims.submissions where tenant_id = $1 and id = $2`,
		testTenant,
		testClaimClean,
	).Scan(&status, &score); err != nil {
		t.Fatal(err)
	}
	if status != "UNDER_REVIEW" || score != 15 {
		t.Fatalf("clean claim status=%s score=%d", status, score)
	}

	if _, err := analyticsWorker.Handle(context.Background(), riskEvent(testClaimConflict)); err != nil {
		t.Fatalf("risk conflict gagal: %v", err)
	}
	var conflict bool
	var flags int
	if err := pool.QueryRow(
		context.Background(),
		`select status, risk_score, has_conflict_flag from claims.submissions
		  where tenant_id = $1 and id = $2`,
		testTenant,
		testClaimConflict,
	).Scan(&status, &score, &conflict); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(
		context.Background(),
		`select count(*) from analytics.anomaly_flags
		  where tenant_id = $1 and claim_id = $2 and conflict_type = 'SHARED_BANK_ACCOUNT'`,
		testTenant,
		testClaimConflict,
	).Scan(&flags); err != nil {
		t.Fatal(err)
	}
	if status != "COMPLIANCE_REVIEW" || !conflict || flags != 1 {
		t.Fatalf("conflict claim status=%s conflict=%v flags=%d", status, conflict, flags)
	}

	if _, err := analyticsWorker.Handle(context.Background(), riskEvent(testClaimThreshold)); err != nil {
		t.Fatalf("risk threshold gagal: %v", err)
	}
	if err := pool.QueryRow(
		context.Background(),
		`select status, risk_score from claims.submissions where tenant_id = $1 and id = $2`,
		testTenant,
		testClaimThreshold,
	).Scan(&status, &score); err != nil {
		t.Fatal(err)
	}
	if status != "ESCALATED" || score != 65 {
		t.Fatalf("threshold claim status=%s score=%d", status, score)
	}
}

func TestIntegrationMISRefresh(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	analyticsWorker := newTestWorker(t, pool)
	result, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:   "019361a2-7c00-7000-8000-000000000994",
		EventType: EventMISRefresh,
		TenantID:  testTenant,
	})
	if err != nil {
		t.Fatalf("refresh MV gagal: %v", err)
	}
	if result["refreshed"] != true {
		t.Fatalf("refresh result %v", result)
	}
}

func TestIntegrationBatch500Under60Seconds(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	cleanupTenant(t, pool)
	seedTenant(t, pool)

	mustExec(t, pool,
		`insert into governance.branches (id, tenant_id, code, name, region, monthly_disbursement_cap)
		 values ($1,$2,'M32-BULK','M3.2 Bulk Branch','Test','10000000000.00')
		 on conflict (id) do update set name = excluded.name`,
		testBulkBranch,
		testTenant,
	)
	mustExec(t, pool,
		`insert into payroll.personnel
		   (id, tenant_id, branch_id, personnel_code, personnel_type, full_name,
		    nik_hash, nik_masked, bank_account_hash, bank_account_masked, bank_code, bank_name,
		    ptkp_status, risk_class, employment_status, base_salary, fixed_allowance, join_date, is_active)
		 select gen_random_uuid(), $1, $2, 'BULK-' || lpad(g::text, 4, '0'), 'EMPLOYEE',
		        'Bulk Worker ' || g::text,
		        md5('nik-' || g::text) || md5('nik-salt-' || g::text),
		        '3273********' || lpad(g::text, 4, '0'),
		        md5('bank-' || g::text) || md5('bank-salt-' || g::text),
		        '******' || lpad(g::text, 4, '0'),
		        'BCA', 'Bank Central Asia', 'TK/0', 'I', 'PERMANENT',
		        '8000000.00', '1000000.00', '2024-01-01', true
		   from generate_series(1, 500) as g`,
		testTenant,
		testBulkBranch,
	)
	mustExec(t, pool,
		`insert into payroll.attendance_summaries
		   (id, tenant_id, personnel_id, period_month, working_days, present_days,
		    paid_leave_days, unpaid_leave_days, absent_days, overtime_hours, source)
		 select gen_random_uuid(), $1, p.id, '2026-11-01', 22, 22, 0, 0, 0, 0, 'MANUAL'
		   from payroll.personnel p
		  where p.tenant_id = $1 and p.branch_id = $2`,
		testTenant,
		testBulkBranch,
	)
	mustExec(t, pool,
		`insert into payroll.batches
		   (id, tenant_id, batch_code, branch_id, period_month, batch_type, correction_seq,
		    period_start, period_end, policy_version_id, status, created_by, idempotency_key)
		 values ($1,$2,'PAY-M32-BULK-202611',$3,'2026-11-01','REGULAR',0,
		         '2026-11-01','2026-11-30',$4,'CALCULATING',$5,'m32-bulk-batch')`,
		testBulkBatch,
		testTenant,
		testBulkBranch,
		testPayrollPolicy,
		testHR,
	)

	analyticsWorker := newTestWorker(t, pool)
	start := time.Now()
	result, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:       "019361a2-7c00-7000-8000-000000000995",
		EventType:     EventBatchCalculate,
		TenantID:      testTenant,
		CorrelationID: testCorrelation,
		RequestedBy:   testHR,
		BatchID:       testBulkBatch,
	})
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("batch 500 gagal: %v", err)
	}
	if result["item_count"] != 500 {
		t.Fatalf("item count %v", result["item_count"])
	}
	if elapsed > 60*time.Second {
		t.Fatalf("batch 500 memerlukan %s", elapsed)
	}
	var itemCount int
	if err := pool.QueryRow(
		context.Background(),
		`select count(*) from payroll.items where tenant_id = $1 and batch_id = $2`,
		testTenant,
		testBulkBatch,
	).Scan(&itemCount); err != nil {
		t.Fatal(err)
	}
	if itemCount != 500 {
		t.Fatalf("item tersimpan %d", itemCount)
	}
	t.Logf("500 item dihitung dan disimpan dalam %s", elapsed)
}

func TestIntegrationRejectsUnsupportedBatchType(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	cleanupTenant(t, pool)
	seedTenant(t, pool)
	mustExec(t, pool,
		`insert into payroll.batches
		   (id, tenant_id, batch_code, branch_id, period_month, batch_type, correction_seq,
		    period_start, period_end, policy_version_id, status, created_by, idempotency_key)
		 values ($1,$2,'PAY-M32-THR-202611',$3,'2026-11-01','THR',0,
		         '2026-11-01','2026-11-30',$4,'CALCULATING',$5,'m32-thr-batch')`,
		testBulkBatch,
		testTenant,
		testBranch,
		testPayrollPolicy,
		testHR,
	)
	analyticsWorker := newTestWorker(t, pool)
	_, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:       "019361a2-7c00-7000-8000-000000000996",
		EventType:     EventBatchCalculate,
		TenantID:      testTenant,
		CorrelationID: testCorrelation,
		RequestedBy:   testHR,
		BatchID:       testBulkBatch,
	})
	if err == nil {
		t.Fatal("expected unsupported batch type error")
	}
	var itemCount int
	if err := pool.QueryRow(
		context.Background(),
		`select count(*) from payroll.items where tenant_id = $1 and batch_id = $2`,
		testTenant,
		testBulkBatch,
	).Scan(&itemCount); err != nil {
		t.Fatal(err)
	}
	if itemCount != 0 {
		t.Fatalf("item tidak boleh dibuat, dapat %d", itemCount)
	}
}

func TestIntegrationPayslipGenerate(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	cleanupTenant(t, pool)
	seedTenant(t, pool)
	analyticsWorker := newTestWorker(t, pool)

	if _, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:       "019361a2-7c00-7000-8000-000000000998",
		EventType:     EventBatchCalculate,
		TenantID:      testTenant,
		CorrelationID: testCorrelation,
		RequestedBy:   testHR,
		BatchID:       testBatch,
	}); err != nil {
		t.Fatalf("batch calculate gagal: %v", err)
	}
	mustExec(t, pool, `update payroll.batches set status = 'APPROVED' where tenant_id = $1 and id = $2`, testTenant, testBatch)

	result, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:         "019361a2-7c00-7000-8000-000000000999",
		EventType:       EventPayslipGenerate,
		TenantID:        testTenant,
		CorrelationID:   testCorrelation,
		RequestedBy:     testHR,
		BatchID:         testBatch,
		PolicyVersionID: testPayrollPolicy,
	})
	if err != nil {
		t.Fatalf("payslip generate gagal: %v", err)
	}
	if result["payslip_count"] != 3 {
		t.Fatalf("payslip count %v", result["payslip_count"])
	}

	var payslipCount, fileCount int
	var grossTotal, netTotal, itemNet string
	if err := pool.QueryRow(
		context.Background(),
		`select count(*), coalesce(sum(gross_income),0)::text, coalesce(sum(net_take_home_pay),0)::text
		   from payroll.payslips where tenant_id = $1 and batch_id = $2`,
		testTenant, testBatch,
	).Scan(&payslipCount, &grossTotal, &netTotal); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(
		context.Background(),
		`select count(*) from payroll.generated_files where tenant_id = $1 and kind = 'PAYSLIP'`,
		testTenant,
	).Scan(&fileCount); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(
		context.Background(),
		`select coalesce(sum(net_take_home_pay),0)::text from payroll.items where tenant_id = $1 and batch_id = $2`,
		testTenant, testBatch,
	).Scan(&itemNet); err != nil {
		t.Fatal(err)
	}
	if payslipCount != 3 || fileCount != 3 {
		t.Fatalf("payslip=%d file=%d", payslipCount, fileCount)
	}
	if netTotal != itemNet {
		t.Fatalf("I-08 net payslip %s != item %s", netTotal, itemNet)
	}
	if grossTotal != "25900000.00" {
		t.Fatalf("gross payslip %s", grossTotal)
	}

	var content []byte
	var checksum string
	if err := pool.QueryRow(
		context.Background(),
		`select content, checksum_sha256 from payroll.generated_files
		  where tenant_id = $1 and kind = 'PAYSLIP' order by created_at limit 1`,
		testTenant,
	).Scan(&content, &checksum); err != nil {
		t.Fatal(err)
	}
	if len(content) < 1000 || string(content[:4]) != "%PDF" {
		t.Fatalf("PDF tidak valid, size=%d", len(content))
	}
	if checksum != sha256Hex(content) {
		t.Fatal("checksum PDF tidak cocok")
	}

	replay, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:       "019361a2-7c00-7000-8000-000000000999",
		EventType:     EventPayslipGenerate,
		TenantID:      testTenant,
		CorrelationID: testCorrelation,
		BatchID:       testBatch,
	})
	if err != nil {
		t.Fatalf("replay payslip gagal: %v", err)
	}
	if replay["skipped"] != true {
		t.Fatalf("replay harus skipped: %v", replay)
	}
}

func TestIntegrationReportGenerate(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	cleanupTenant(t, pool)
	seedTenant(t, pool)
	analyticsWorker := newTestWorker(t, pool)

	if _, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:       "019361a2-7c00-7000-8000-0000000009a1",
		EventType:     EventBatchCalculate,
		TenantID:      testTenant,
		CorrelationID: testCorrelation,
		RequestedBy:   testHR,
		BatchID:       testBatch,
	}); err != nil {
		t.Fatalf("batch calculate gagal: %v", err)
	}
	mustExec(t, pool, `update payroll.batches set status = 'DISBURSED' where tenant_id = $1 and id = $2`, testTenant, testBatch)
	const reportID = "019361a2-7c00-7000-8000-0000000009b0"
	mustExec(t, pool,
		`insert into payroll.tax_reports
		   (id, tenant_id, report_type, branch_id, policy_version_id, period_start, period_end,
		    version, status, totals, generated_by)
		 values ($1,$2,'PPH21_MONTHLY',$3,$4,'2026-11-01','2026-11-30',1,'QUEUED','{}',$5)`,
		reportID, testTenant, testBranch, testPayrollPolicy, testHR,
	)

	result, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:       "019361a2-7c00-7000-8000-0000000009b1",
		EventType:     EventReportGenerate,
		TenantID:      testTenant,
		CorrelationID: testCorrelation,
		RequestedBy:   testHR,
		ReportID:      reportID,
		ReportType:    "PPH21_MONTHLY",
	})
	if err != nil {
		t.Fatalf("report generate gagal: %v", err)
	}
	if result["status"] != "READY" {
		t.Fatalf("status report %v", result["status"])
	}
	var status, checksum, snapshot, net, itemNet string
	var fileSize int
	if err := pool.QueryRow(
		context.Background(),
		`select status, file_checksum_sha256, snapshot_hash_sha256, total_net::text
		   from payroll.tax_reports where tenant_id = $1 and id = $2`,
		testTenant, reportID,
	).Scan(&status, &checksum, &snapshot, &net); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(
		context.Background(),
		`select file_size from payroll.generated_files where tenant_id = $1 and entity_id = $2`,
		testTenant, reportID,
	).Scan(&fileSize); err != nil {
		t.Fatal(err)
	}
	var content []byte
	if err := pool.QueryRow(
		context.Background(),
		`select content from payroll.generated_files where tenant_id = $1 and entity_id = $2`,
		testTenant, reportID,
	).Scan(&content); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(
		context.Background(),
		`select coalesce(sum(net_take_home_pay),0)::text from payroll.items where tenant_id = $1 and batch_id = $2`,
		testTenant, testBatch,
	).Scan(&itemNet); err != nil {
		t.Fatal(err)
	}
	if status != "READY" || fileSize != len(content) || len(content) < 200 {
		t.Fatalf("report status=%s size=%d content=%d", status, fileSize, len(content))
	}
	if checksum != sha256Hex(content) || snapshot == "" {
		t.Fatal("checksum atau snapshot report tidak valid")
	}
	if net != itemNet {
		t.Fatalf("net report %s != item %s", net, itemNet)
	}
	replay, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:       "019361a2-7c00-7000-8000-0000000009b1",
		EventType:     EventReportGenerate,
		TenantID:      testTenant,
		CorrelationID: testCorrelation,
		ReportID:      reportID,
	})
	if err != nil || replay["skipped"] != true {
		t.Fatalf("replay report %v %v", replay, err)
	}
}

func TestIntegrationCostInvoiceReport(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	cleanupTenant(t, pool)
	seedTenant(t, pool)
	analyticsWorker := newTestWorker(t, pool)

	if _, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:       "019361a2-7c00-7000-8000-0000000009c1",
		EventType:     EventBatchCalculate,
		TenantID:      testTenant,
		CorrelationID: testCorrelation,
		RequestedBy:   testHR,
		BatchID:       testBatch,
	}); err != nil {
		t.Fatalf("batch calculate gagal: %v", err)
	}
	mustExec(t, pool, `update payroll.batches set status = 'DISBURSED' where tenant_id = $1 and id = $2`, testTenant, testBatch)
	const reportID = "019361a2-7c00-7000-8000-0000000009c0"
	mustExec(t, pool,
		`insert into payroll.tax_reports
		   (id, tenant_id, report_type, branch_id, policy_version_id, period_start, period_end,
		    version, status, totals, generated_by)
		 values ($1,$2,'PAYROLL_COST_INVOICE',$3,$4,'2026-11-01','2026-11-30',1,'QUEUED','{}',$5)`,
		reportID, testTenant, testBranch, testCostPolicy, testHR,
	)

	result, err := analyticsWorker.Handle(context.Background(), Event{
		EventID:       "019361a2-7c00-7000-8000-0000000009c2",
		EventType:     EventReportGenerate,
		TenantID:      testTenant,
		CorrelationID: testCorrelation,
		RequestedBy:   testHR,
		ReportID:      reportID,
		ReportType:    "PAYROLL_COST_INVOICE",
	})
	if err != nil {
		t.Fatalf("cost invoice generate gagal: %v", err)
	}
	if result["status"] != "READY" {
		t.Fatalf("status report %v", result["status"])
	}

	var totalsRaw []byte
	if err := pool.QueryRow(
		context.Background(),
		`select totals from payroll.tax_reports where tenant_id = $1 and id = $2`,
		testTenant, reportID,
	).Scan(&totalsRaw); err != nil {
		t.Fatal(err)
	}
	var fileName string
	var fileSize int
	var content []byte
	if err := pool.QueryRow(
		context.Background(),
		`select file_name, file_size, content from payroll.generated_files
		  where tenant_id = $1 and entity_id = $2`,
		testTenant, reportID,
	).Scan(&fileName, &fileSize, &content); err != nil {
		t.Fatal(err)
	}
	var totals map[string]string
	if err := json.Unmarshal(totalsRaw, &totals); err != nil {
		t.Fatal(err)
	}
	if totals["bjo"] == "" || totals["management_fee"] == "" || totals["total_invoice"] == "" {
		t.Fatalf("totals invoice tidak lengkap: %v", totals)
	}
	if !strings.HasSuffix(totals["total_invoice"], "000.00") {
		t.Fatalf("invoice tidak dibulatkan ke 1000: %s", totals["total_invoice"])
	}
	text := string(content)
	if !strings.Contains(text, "M32-01") ||
		!strings.Contains(text, "total_invoice") ||
		!strings.Contains(text, "# bjo_rate,0.0250") {
		t.Fatalf("isi invoice tidak sesuai: %s", text)
	}
	if fileSize != len(content) || len(content) < 200 {
		t.Fatalf("file invoice size=%d content=%d", fileSize, len(content))
	}
	if fileName != "payroll-cost-invoice-2026-11-v1.csv" {
		t.Fatalf("nama file invoice %s", fileName)
	}
}
