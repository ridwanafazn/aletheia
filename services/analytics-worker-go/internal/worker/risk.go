package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

type claimsPolicy struct {
	ApprovalTiers struct {
		Level1Max    decimal.Decimal `json:"level_1_branch_manager_max"`
		AutoEscalate int             `json:"auto_escalate_risk_threshold"`
	} `json:"approval_tiers"`
	RiskWeights struct {
		MissingOptional    int             `json:"missing_optional_evidence_points"`
		HighRatioThreshold decimal.Decimal `json:"high_amount_ratio_threshold"`
		HighRatioPoints    int             `json:"high_amount_ratio_points"`
		RepeatPoints       int             `json:"repeat_bank_account_30d_points"`
		ConflictPoints     int             `json:"cross_domain_conflict_points"`
	} `json:"risk_scoring_weights"`
	OptionalDocuments map[string][]string `json:"optional_documents_by_category"`
}

func (w *Worker) handleClaimRisk(ctx context.Context, event Event) (map[string]any, error) {
	var claimID, bankHash, nikHash, category, amountText, policyVersionID, status string
	var riskEvaluatedAt *time.Time
	var createdBy string
	err := w.pool.QueryRow(
		ctx,
		`select id::text, bank_account_hash, claimant_nik_hash, claim_category,
		        requested_amount::text, policy_version_id::text, risk_evaluated_at,
		        status, created_by::text
		   from claims.submissions
		  where tenant_id = $1 and id = $2`,
		event.TenantID,
		event.ClaimID,
	).Scan(&claimID, &bankHash, &nikHash, &category, &amountText, &policyVersionID, &riskEvaluatedAt, &status, &createdBy)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("klaim tidak ditemukan")
		}
		return nil, err
	}
	if riskEvaluatedAt != nil {
		return map[string]any{"claim_id": claimID, "status": status, "skipped": true}, nil
	}

	var policyPayload []byte
	if err := w.pool.QueryRow(
		ctx,
		`select rules_payload from governance.policy_versions
		  where tenant_id = $1 and id = $2 and domain = 'CLAIMS_POLICY'`,
		event.TenantID,
		policyVersionID,
	).Scan(&policyPayload); err != nil {
		return nil, err
	}
	var rules claimsPolicy
	if err := json.Unmarshal(policyPayload, &rules); err != nil {
		return nil, fmt.Errorf("claims policy tidak valid: %w", err)
	}
	if rules.ApprovalTiers.Level1Max.IsZero() {
		return nil, fmt.Errorf("policy key approval_tiers.level_1_branch_manager_max hilang")
	}
	if rules.ApprovalTiers.AutoEscalate <= 0 || rules.ApprovalTiers.AutoEscalate > 100 {
		return nil, fmt.Errorf("policy key approval_tiers.auto_escalate_risk_threshold tidak valid")
	}
	if rules.RiskWeights.HighRatioThreshold.IsZero() {
		return nil, fmt.Errorf("policy key risk_scoring_weights.high_amount_ratio_threshold tidak valid")
	}

	amount := mustDecimal(amountText)
	score := 0
	ratio := amount.Div(rules.ApprovalTiers.Level1Max)
	if ratio.GreaterThanOrEqual(rules.RiskWeights.HighRatioThreshold) {
		score += rules.RiskWeights.HighRatioPoints
	}

	var repeatCount int
	if err := w.pool.QueryRow(
		ctx,
		`select count(*) from claims.submissions
		  where tenant_id = $1 and bank_account_hash = $2 and id <> $3
		    and status <> 'DRAFT' and created_at >= now() - interval '30 days'`,
		event.TenantID,
		bankHash,
		claimID,
	).Scan(&repeatCount); err != nil {
		return nil, err
	}
	if repeatCount >= 2 {
		score += rules.RiskWeights.RepeatPoints
	}

	type personnelMatch struct {
		ID, Code, Type string
		BankMatch      bool
		NIKMatch       bool
	}
	rows, err := w.pool.Query(
		ctx,
		`select id::text, personnel_code, personnel_type,
		        (bank_account_hash = $2) as bank_match,
		        (personnel_type = 'SALES_AGENT' and nik_hash = $3) as nik_match
		   from payroll.personnel
		  where tenant_id = $1 and employment_status <> 'INACTIVE'
		    and (bank_account_hash = $2 or (personnel_type = 'SALES_AGENT' and nik_hash = $3))`,
		event.TenantID,
		bankHash,
		nikHash,
	)
	if err != nil {
		return nil, err
	}
	var matches []personnelMatch
	for rows.Next() {
		var match personnelMatch
		if err := rows.Scan(&match.ID, &match.Code, &match.Type, &match.BankMatch, &match.NIKMatch); err != nil {
			rows.Close()
			return nil, err
		}
		matches = append(matches, match)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(matches) > 0 {
		score += rules.RiskWeights.ConflictPoints
	}

	type multiClaim struct {
		Count  int
		Latest string
	}
	var multi multiClaim
	if err := w.pool.QueryRow(
		ctx,
		`select count(*), coalesce((array_agg(id::text order by created_at desc))[1], '')
		   from claims.submissions
		  where tenant_id = $1 and bank_account_hash = $2 and id <> $3
		    and status <> 'DRAFT' and created_at >= now() - interval '30 days'`,
		event.TenantID,
		bankHash,
		claimID,
	).Scan(&multi.Count, &multi.Latest); err != nil {
		return nil, err
	}
	hasMulti := multi.Count+1 >= 3 && multi.Latest != ""

	docRows, err := w.pool.Query(
		ctx,
		`select document_type from claims.documents where tenant_id = $1 and claim_id = $2`,
		event.TenantID,
		claimID,
	)
	if err != nil {
		return nil, err
	}
	present := map[string]bool{}
	for docRows.Next() {
		var documentType string
		if err := docRows.Scan(&documentType); err != nil {
			docRows.Close()
			return nil, err
		}
		present[documentType] = true
	}
	docRows.Close()
	missingOptional := 0
	for _, documentType := range rules.OptionalDocuments[category] {
		if !present[documentType] {
			missingOptional++
		}
	}
	if missingOptional > 0 {
		score += rules.RiskWeights.MissingOptional
	}
	if score > 100 {
		score = 100
	}

	critical := false
	flagCount := 0
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(
		ctx,
		`delete from analytics.anomaly_flags where tenant_id = $1 and claim_id = $2`,
		event.TenantID,
		claimID,
	); err != nil {
		return nil, err
	}
	for _, match := range matches {
		if match.BankMatch {
			if err := insertAnomaly(ctx, tx, event.TenantID, claimID, match.ID, "", "SHARED_BANK_ACCOUNT", "CRITICAL", match.Code, match.Type); err != nil {
				return nil, err
			}
			critical = true
			flagCount++
		}
		if match.NIKMatch {
			if err := insertAnomaly(ctx, tx, event.TenantID, claimID, match.ID, "", "SHARED_NIK_IDENTITY", "CRITICAL", match.Code, match.Type); err != nil {
				return nil, err
			}
			critical = true
			flagCount++
		}
	}
	if hasMulti {
		if err := insertAnomaly(ctx, tx, event.TenantID, claimID, "", multi.Latest, "MULTI_CLAIM_SAME_ACCOUNT", "HIGH", "", ""); err != nil {
			return nil, err
		}
		flagCount++
	}

	requiresLevel2 := critical || flagCount > 0 || score >= rules.ApprovalTiers.AutoEscalate ||
		amount.GreaterThan(rules.ApprovalTiers.Level1Max)
	nextStatus := "UNDER_REVIEW"
	if critical {
		nextStatus = "COMPLIANCE_REVIEW"
	} else if requiresLevel2 {
		nextStatus = "ESCALATED"
	}
	if _, err := tx.Exec(
		ctx,
		`update claims.submissions
		    set risk_score = $3, risk_evaluated_at = now(), has_conflict_flag = $4,
		        status = $5, updated_at = now()
		  where tenant_id = $1 and id = $2`,
		event.TenantID,
		claimID,
		score,
		flagCount > 0,
		nextStatus,
	); err != nil {
		return nil, err
	}
	if err := w.appendAudit(
		ctx,
		tx,
		event.TenantID,
		event.CorrelationID,
		"CLAIMS",
		"CLAIM",
		claimID,
		"CLAIM_RISK_EVALUATED",
		policyVersionID,
		map[string]any{
			"risk_score":    score,
			"route":         nextStatus,
			"anomaly_flags": flagCount,
			"actor_source":  "ANALYTICS_WORKER",
			"created_by":    createdBy,
		},
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return map[string]any{"claim_id": claimID, "status": nextStatus, "risk_score": score, "anomaly_flags": flagCount}, nil
}

func insertAnomaly(
	ctx context.Context,
	tx pgx.Tx,
	tenantID string,
	claimID string,
	personnelID string,
	matchedClaimID string,
	conflictType string,
	severity string,
	personnelCode string,
	personnelType string,
) error {
	evidence, _ := json.Marshal(map[string]any{
		"matched_personnel_code": personnelCode,
		"matched_personnel_type": personnelType,
	})
	_, err := tx.Exec(
		ctx,
		`insert into analytics.anomaly_flags
		  (id, tenant_id, claim_id, matched_personnel_id, matched_claim_id, conflict_type,
		   severity, evidence_summary, resolution_status)
		 values (gen_random_uuid(), $1, $2, nullif($3, '')::uuid, nullif($4, '')::uuid,
		         $5, $6, $7::jsonb, 'OPEN')`,
		tenantID,
		claimID,
		personnelID,
		matchedClaimID,
		conflictType,
		severity,
		evidence,
	)
	return err
}
