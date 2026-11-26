CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aletheia_app') THEN
    CREATE ROLE aletheia_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aletheia_readonly') THEN
    CREATE ROLE aletheia_readonly NOLOGIN;
  END IF;
END
$$;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'governance.branches',
    'governance.users',
    'governance.policy_versions',
    'governance.audit_logs',
    'governance.refresh_tokens',
    'governance.mfa_recovery_codes',
    'claims.submissions',
    'claims.documents',
    'claims.approval_steps',
    'claims.disbursements',
    'payroll.personnel',
    'payroll.sales_achievements',
    'payroll.batches',
    'payroll.items',
    'payroll.attendance_summaries',
    'payroll.leave_requests',
    'payroll.payslips',
    'payroll.tax_reports',
    'payroll.tax_reconciliations',
    'payroll.payments',
    'analytics.anomaly_flags',
    'analytics.what_if_simulations'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', target_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      target_table
    );
  END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_active_domain
  ON governance.policy_versions (tenant_id, domain)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_policy_rules_gin
  ON governance.policy_versions USING GIN (rules_payload jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_claims_pending_approval
  ON claims.submissions (tenant_id, created_at)
  WHERE status IN ('SUBMITTED', 'UNDER_REVIEW', 'ESCALATED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_disbursements_active
  ON claims.disbursements (tenant_id, claim_id)
  WHERE status IN ('PENDING', 'PROCESSING', 'PAID');

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_payments_active
  ON payroll.payments (tenant_id, batch_id, personnel_id)
  WHERE status IN ('PENDING', 'PROCESSING', 'PAID');

CREATE INDEX IF NOT EXISTS idx_payroll_payment_pending
  ON payroll.items (tenant_id, batch_id)
  WHERE payment_status IN ('PENDING', 'PROCESSING');

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_reconciliations_posted
  ON payroll.tax_reconciliations (tenant_id, personnel_id, tax_year)
  WHERE status = 'POSTED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_reports_null_branch
  ON payroll.tax_reports (tenant_id, report_type, period_start, period_end, version)
  WHERE branch_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_steps_final
  ON claims.approval_steps (tenant_id, claim_id, step_level)
  WHERE decision IN ('APPROVED', 'REJECTED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_anomaly_personnel
  ON analytics.anomaly_flags (tenant_id, claim_id, matched_personnel_id, conflict_type)
  WHERE matched_personnel_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_anomaly_claim
  ON analytics.anomaly_flags (tenant_id, claim_id, matched_claim_id, conflict_type)
  WHERE matched_claim_id IS NOT NULL;

CREATE OR REPLACE FUNCTION governance.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY_VIOLATION: Records in governance.audit_logs are immutable and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON governance.audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
  BEFORE UPDATE OR DELETE ON governance.audit_logs
  FOR EACH ROW EXECUTE FUNCTION governance.prevent_audit_mutation();

CREATE OR REPLACE FUNCTION governance.append_audit_log(
  p_tenant_id uuid,
  p_event_uuid uuid,
  p_correlation_id uuid,
  p_actor_id uuid,
  p_actor_role varchar,
  p_domain varchar,
  p_entity_type varchar,
  p_entity_id uuid,
  p_action varchar,
  p_policy_version_id uuid,
  p_decision_context jsonb
)
RETURNS governance.audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = governance, public, pg_catalog
AS $$
DECLARE
  v_prev text;
  v_recorded_at timestamptz := clock_timestamp();
  v_payload jsonb;
  v_hash text;
  v_row governance.audit_logs%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));

  SELECT *
    INTO v_row
    FROM governance.audit_logs
   WHERE tenant_id = p_tenant_id
     AND event_uuid = p_event_uuid;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT record_hash::text
    INTO v_prev
    FROM governance.audit_logs
   WHERE tenant_id = p_tenant_id
   ORDER BY id DESC
   LIMIT 1;

  v_prev := COALESCE(v_prev, repeat('0', 64));

  v_payload := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'event_uuid', p_event_uuid,
    'correlation_id', p_correlation_id,
    'actor_id', p_actor_id,
    'actor_role', p_actor_role,
    'domain', p_domain,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'action', p_action,
    'policy_version_id', p_policy_version_id,
    'decision_context', p_decision_context,
    'recorded_at', v_recorded_at
  );

  v_hash := encode(digest(convert_to(v_payload::text || v_prev, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO governance.audit_logs (
    tenant_id,
    event_uuid,
    correlation_id,
    actor_id,
    actor_role,
    domain,
    entity_type,
    entity_id,
    action,
    policy_version_id,
    decision_context,
    prev_record_hash,
    record_hash,
    recorded_at
  ) VALUES (
    p_tenant_id,
    p_event_uuid,
    p_correlation_id,
    p_actor_id,
    p_actor_role,
    p_domain,
    p_entity_type,
    p_entity_id,
    p_action,
    p_policy_version_id,
    p_decision_context,
    v_prev,
    v_hash,
    v_recorded_at
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION governance.append_audit_log(
  uuid, uuid, uuid, uuid, varchar, varchar, varchar, uuid, varchar, uuid, jsonb
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION claims.enforce_approval_sod()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_creator uuid;
BEGIN
  SELECT created_by
    INTO v_creator
    FROM claims.submissions
   WHERE id = NEW.claim_id;

  IF v_creator = NEW.approver_id THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: approver_id cannot equal claims.submissions.created_by';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claims_approval_sod ON claims.approval_steps;
CREATE TRIGGER trg_claims_approval_sod
  BEFORE INSERT OR UPDATE ON claims.approval_steps
  FOR EACH ROW EXECUTE FUNCTION claims.enforce_approval_sod();

CREATE MATERIALIZED VIEW analytics.mis_monthly_kpi AS
WITH claim_months AS (
  SELECT
    tenant_id,
    branch_id,
    date_trunc('month', created_at)::date AS report_month,
    count(*)::int AS total_claims_submitted,
    count(*) FILTER (WHERE status IN ('APPROVED', 'DISBURSED'))::int AS total_claims_approved,
    coalesce(
      sum(approved_amount) FILTER (WHERE status IN ('APPROVED', 'DISBURSED')),
      0
    )::numeric(18, 2) AS total_claims_approved_amount,
    coalesce(
      avg(EXTRACT(EPOCH FROM (finalized_at - submitted_at)) / 3600)
        FILTER (WHERE finalized_at IS NOT NULL AND submitted_at IS NOT NULL),
      0
    )::numeric(10, 2) AS avg_turnaround_hours
  FROM claims.submissions
  GROUP BY 1, 2, 3
),
payroll_months AS (
  SELECT
    b.tenant_id,
    b.branch_id,
    b.period_month AS report_month,
    coalesce(sum(i.net_take_home_pay), 0)::numeric(18, 2) AS total_payroll_disbursed,
    coalesce(sum(i.pph21_tax_deduction), 0)::numeric(18, 2) AS total_pph21_collected
  FROM payroll.batches b
  JOIN payroll.items i ON i.batch_id = b.id AND i.tenant_id = b.tenant_id
  WHERE b.status IN ('DISBURSED', 'PARTIAL')
  GROUP BY 1, 2, 3
),
months AS (
  SELECT tenant_id, branch_id, report_month FROM claim_months
  UNION
  SELECT tenant_id, branch_id, report_month FROM payroll_months
),
base AS (
  SELECT
    m.tenant_id,
    m.branch_id,
    m.report_month,
    coalesce(c.total_claims_submitted, 0) AS total_claims_submitted,
    coalesce(c.total_claims_approved, 0) AS total_claims_approved,
    coalesce(c.total_claims_approved_amount, 0) AS total_claims_approved_amount,
    coalesce(c.avg_turnaround_hours, 0) AS avg_turnaround_hours,
    coalesce(p.total_payroll_disbursed, 0) AS total_payroll_disbursed,
    coalesce(p.total_pph21_collected, 0) AS total_pph21_collected
  FROM months m
  LEFT JOIN claim_months c
    ON c.tenant_id = m.tenant_id
   AND c.branch_id = m.branch_id
   AND c.report_month = m.report_month
  LEFT JOIN payroll_months p
    ON p.tenant_id = m.tenant_id
   AND p.branch_id = m.branch_id
   AND p.report_month = m.report_month
)
SELECT
  b.tenant_id,
  b.branch_id,
  br.code AS branch_code,
  br.name AS branch_name,
  b.report_month,
  b.total_claims_submitted,
  b.total_claims_approved,
  b.total_claims_approved_amount,
  CASE
    WHEN b.total_claims_submitted = 0 THEN 0
    ELSE round((b.total_claims_approved::numeric / b.total_claims_submitted) * 100, 2)
  END AS claim_approval_rate_pct,
  b.avg_turnaround_hours,
  b.total_payroll_disbursed,
  b.total_pph21_collected,
  CASE
    WHEN br.monthly_disbursement_cap = 0 THEN 0
    ELSE round((b.total_payroll_disbursed / br.monthly_disbursement_cap) * 100, 2)
  END AS budget_utilization_pct,
  coalesce(
    round(
      (
        b.total_payroll_disbursed
        - lag(b.total_payroll_disbursed) OVER (
            PARTITION BY b.tenant_id, b.branch_id
            ORDER BY b.report_month
          )
      )
      / nullif(
          lag(b.total_payroll_disbursed) OVER (
            PARTITION BY b.tenant_id, b.branch_id
            ORDER BY b.report_month
          ),
          0
        )
      * 100,
      2
    ),
    0
  ) AS mom_variance_pct
FROM base b
JOIN governance.branches br
  ON br.id = b.branch_id
 AND br.tenant_id = b.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mis_monthly_kpi_unique
  ON analytics.mis_monthly_kpi (tenant_id, branch_id, report_month);

CREATE OR REPLACE VIEW analytics.v_mis_monthly_kpi
WITH (security_barrier = true)
AS
SELECT *
FROM analytics.mis_monthly_kpi
WHERE tenant_id = current_setting('app.tenant_id', true)::uuid;

GRANT USAGE ON SCHEMA governance, claims, payroll, analytics TO aletheia_app;
GRANT USAGE ON SCHEMA governance, claims, payroll, analytics TO aletheia_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA governance, claims, payroll, analytics
  TO aletheia_app;

GRANT SELECT
  ON ALL TABLES IN SCHEMA governance, claims, payroll, analytics
  TO aletheia_readonly;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA governance, claims, payroll, analytics
  TO aletheia_app;

REVOKE INSERT, UPDATE, DELETE ON governance.audit_logs FROM aletheia_app;

GRANT EXECUTE ON FUNCTION governance.append_audit_log(
  uuid, uuid, uuid, uuid, varchar, varchar, varchar, uuid, varchar, uuid, jsonb
) TO aletheia_app;

GRANT SELECT ON analytics.v_mis_monthly_kpi TO aletheia_app;
GRANT SELECT ON analytics.v_mis_monthly_kpi TO aletheia_readonly;
