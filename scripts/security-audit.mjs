import { closeDatabase, pool } from "../packages/database/dist/index.js";

const failures = [];
const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

async function main() {
  const tenantTables = await pool.query(`
    select n.nspname as schema_name, c.relname as table_name,
           c.relrowsecurity as rls_enabled,
           (select count(*) from pg_policies p
             where p.schemaname = n.nspname and p.tablename = c.relname) as policy_count,
           (select bool_or(coalesce(p.with_check, '') = '' or p.with_check = 'true')
              from pg_policies p
             where p.schemaname = n.nspname and p.tablename = c.relname) as weak_with_check
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('governance','claims','payroll','analytics')
       and c.relkind = 'r'
       and exists (
         select 1 from information_schema.columns col
          where col.table_schema = n.nspname
            and col.table_name = c.relname
            and col.column_name = 'tenant_id'
       )
     order by 1,2
  `);
  for (const row of tenantTables.rows) {
    record(
      `${row.schema_name}.${row.table_name} RLS`,
      row.rls_enabled === true && Number(row.policy_count) > 0 && row.weak_with_check !== true,
      `rls=${row.rls_enabled} policy=${row.policy_count} weak_with_check=${row.weak_with_check}`,
    );
  }

  const tenantPolicy = await pool.query(`
    select c.relrowsecurity,
           (select count(*) from pg_policies p
             where p.schemaname = 'governance' and p.tablename = 'tenants') as policy_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'governance' and c.relname = 'tenants'
  `);
  record(
    "governance.tenants root RLS",
    tenantPolicy.rows[0]?.relrowsecurity === true && Number(tenantPolicy.rows[0]?.policy_count) > 0,
    JSON.stringify(tenantPolicy.rows[0]),
  );

  const role = await pool.query(`
    select rolname, rolsuper, rolbypassrls, rolcanlogin
      from pg_roles where rolname = 'aletheia_app'
  `);
  record("aletheia_app role exists", role.rowCount === 1, JSON.stringify(role.rows[0] ?? {}));
  if (role.rowCount === 1) {
    const appRole = role.rows[0];
    record(
      "aletheia_app is not superuser",
      appRole.rolsuper === false,
      `rolsuper=${appRole.rolsuper}`,
    );
    record(
      "aletheia_app cannot bypass RLS",
      appRole.rolbypassrls === false,
      `rolbypassrls=${appRole.rolbypassrls}`,
    );
  }

  const auditPrivileges = await pool.query(`
    select has_table_privilege('aletheia_app','governance.audit_logs','INSERT') as can_insert,
           has_table_privilege('aletheia_app','governance.audit_logs','UPDATE') as can_update,
           has_table_privilege('aletheia_app','governance.audit_logs','DELETE') as can_delete,
           has_function_privilege('aletheia_app','governance.append_audit_log(uuid,uuid,uuid,uuid,varchar,varchar,varchar,uuid,varchar,uuid,jsonb)','EXECUTE') as can_append
  `);
  const audit = auditPrivileges.rows[0];
  record(
    "audit_logs append-only privileges",
    audit.can_insert === false &&
      audit.can_update === false &&
      audit.can_delete === false &&
      audit.can_append === true,
    JSON.stringify(audit),
  );

  const definerFunctions = await pool.query(`
    select p.proname, p.prosecdef, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'governance'
       and p.proname in ('append_audit_log','prevent_audit_mutation')
  `);
  for (const fn of definerFunctions.rows) {
    const config = Array.isArray(fn.proconfig) ? fn.proconfig : [];
    record(
      `${fn.proname} search_path`,
      fn.prosecdef !== true || config.some((item) => item.startsWith("search_path=")),
      `security_definer=${fn.prosecdef} config=${JSON.stringify(config)}`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE aletheia_app");
    const noSetting = await client.query(`
      select
        (select count(*) from payroll.personnel) as personnel,
        (select count(*) from claims.submissions) as claims,
        (select count(*) from payroll.batches) as batches,
        (select count(*) from governance.tenants) as tenants
    `);
    const counts = noSetting.rows[0];
    record(
      "RLS without app.tenant_id returns zero rows",
      [counts.personnel, counts.claims, counts.batches, counts.tenants].every(
        (value) => Number(value) === 0,
      ),
      JSON.stringify(counts),
    );

    await client.query(
      "select set_config('app.tenant_id', '019361a2-7c00-7000-8000-000000000001', true)",
    );
    const sau = await client.query(`
      select (select count(*) from payroll.personnel) as personnel,
             (select count(*) from claims.submissions) as claims,
             (select count(*) from governance.tenants) as tenants
    `);
    record(
      "RLS with SAU tenant returns SAU rows only",
      Number(sau.rows[0].personnel) > 0 &&
        Number(sau.rows[0].claims) > 0 &&
        Number(sau.rows[0].tenants) === 1,
      JSON.stringify(sau.rows[0]),
    );

    await client.query(
      "select set_config('app.tenant_id', '019361a2-7c00-7000-8000-000000000002', true)",
    );
    const bpui = await client.query(`
      select (select count(*) from claims.submissions) as claims,
             (select count(*) from governance.tenants) as tenants
    `);
    record(
      "RLS with BPUI tenant hides SAU claims",
      Number(bpui.rows[0].claims) === 0 && Number(bpui.rows[0].tenants) === 1,
      JSON.stringify(bpui.rows[0]),
    );
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    record("RLS runtime probe", false, error instanceof Error ? error.message : "unknown");
  } finally {
    client.release();
  }

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "BLOCKER"} ${check.name} — ${check.detail}`);
  }
  console.log(`\n${checks.filter((item) => item.ok).length}/${checks.length} checks passed`);
  await closeDatabase();
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error("SECURITY_AUDIT_FAILED", error);
  await closeDatabase();
  process.exitCode = 1;
});
