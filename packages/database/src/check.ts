import { adminPool as pool, closeAdminDatabase } from "./admin.js";

const expectedTables = [
  "governance.tenants",
  "governance.branches",
  "governance.users",
  "governance.policy_versions",
  "governance.audit_logs",
  "governance.refresh_tokens",
  "governance.mfa_recovery_codes",
  "governance.idempotency_records",
  "claims.submissions",
  "claims.documents",
  "claims.approval_steps",
  "claims.disbursements",
  "payroll.personnel",
  "payroll.sales_achievements",
  "payroll.batches",
  "payroll.items",
  "payroll.attendance_summaries",
  "payroll.leave_requests",
  "payroll.payslips",
  "payroll.tax_reports",
  "payroll.tax_reconciliations",
  "payroll.payments",
  "payroll.generated_files",
  "payroll.payment_webhook_events",
  "analytics.anomaly_flags",
  "analytics.what_if_simulations",
];

const expectedFunctions = [
  "governance.append_audit_log",
  "governance.prevent_audit_mutation",
  "claims.enforce_approval_sod",
];

async function tenantIsolationCounts(): Promise<{
  noSetting: string;
  sauBranches: string;
  bpuiBranches: string;
  bpuiClaims: string;
}> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE aletheia_app");
    const noSetting =
      (
        await client.query<{ count: string }>(
          `select (
             (select count(*) from governance.branches) +
             (select count(*) from payroll.personnel) +
             (select count(*) from claims.submissions) +
             (select count(*) from governance.tenants)
           )::text as count`,
        )
      ).rows[0]?.count ?? "0";
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [
      "019361a2-7c00-7000-8000-000000000001",
    ]);
    const sauBranches =
      (
        await client.query<{ count: string }>(
          `select count(*)::text as count from governance.branches`,
        )
      ).rows[0]?.count ?? "0";

    await client.query("SELECT set_config('app.tenant_id', $1, true)", [
      "019361a2-7c00-7000-8000-000000000002",
    ]);
    const bpuiBranches =
      (
        await client.query<{ count: string }>(
          `select count(*)::text as count from governance.branches`,
        )
      ).rows[0]?.count ?? "0";
    const bpuiClaims =
      (
        await client.query<{ count: string }>(
          `select count(*)::text as count from claims.submissions`,
        )
      ).rows[0]?.count ?? "0";

    return { noSetting, sauBranches, bpuiBranches, bpuiClaims };
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function main(): Promise<void> {
  const tables = await pool.query<{ table_schema: string; table_name: string }>(
    `select table_schema, table_name
       from information_schema.tables
      where table_schema in ('governance','claims','payroll','analytics')`,
  );
  const actualTables = new Set(tables.rows.map((row) => `${row.table_schema}.${row.table_name}`));
  const missingTables = expectedTables.filter((table) => !actualTables.has(table));

  const functions = await pool.query<{ name: string }>(
    `select n.nspname || '.' || p.proname as name
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('governance','claims')`,
  );
  const actualFunctions = new Set(functions.rows.map((row) => row.name));
  const missingFunctions = expectedFunctions.filter((name) => !actualFunctions.has(name));

  const policies = await pool.query<{ count: string }>(
    `select count(*)::text as count from pg_policies where schemaname in ('governance','claims','payroll','analytics')`,
  );

  const materializedViews = await pool.query<{ matviewname: string }>(
    `select matviewname from pg_matviews where schemaname = 'analytics'`,
  );

  const auditLogs = await pool.query<{ count: string }>(
    `select count(*)::text as count from governance.audit_logs`,
  );

  const kpiRows = await pool.query<{ count: string }>(
    `select count(*)::text as count from analytics.mis_monthly_kpi`,
  );

  const { noSetting, sauBranches, bpuiBranches, bpuiClaims } = await tenantIsolationCounts();

  console.log("Tables:", expectedTables.length - missingTables.length, "/", expectedTables.length);
  console.log(
    "Functions:",
    expectedFunctions.length - missingFunctions.length,
    "/",
    expectedFunctions.length,
  );
  console.log("RLS policies:", policies.rows[0]?.count ?? "0");
  console.log(
    "Materialized views:",
    materializedViews.rows.map((row) => row.matviewname).join(", "),
  );
  console.log("Audit rows:", auditLogs.rows[0]?.count ?? "0");
  console.log("KPI rows:", kpiRows.rows[0]?.count ?? "0");
  console.log("RLS without tenant setting:", noSetting, "expected 0");
  console.log("RLS SAU branches:", sauBranches, "expected 3");
  console.log("RLS BPUI branches:", bpuiBranches, "expected 1");
  console.log("RLS BPUI claims:", bpuiClaims, "expected 0");

  const isolationOk =
    noSetting === "0" && sauBranches === "3" && bpuiBranches === "1" && bpuiClaims === "0";

  if (missingTables.length > 0 || missingFunctions.length > 0 || !isolationOk) {
    console.error("Missing tables:", missingTables);
    console.error("Missing functions:", missingFunctions);
    console.error("Tenant isolation check:", isolationOk ? "pass" : "fail");
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAdminDatabase();
  });
