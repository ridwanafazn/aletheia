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
    'governance.idempotency_records',
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
    'payroll.generated_files',
    'payroll.payment_webhook_events',
    'analytics.anomaly_flags',
    'analytics.what_if_simulations'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', target_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      target_table
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS tenant_self_isolation ON governance.tenants;
CREATE POLICY tenant_self_isolation ON governance.tenants
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
