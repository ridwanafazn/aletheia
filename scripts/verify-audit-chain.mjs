import { closeDatabase, pool } from "../packages/database/dist/index.js";

const failures = [];

async function verifyTenant(tenantId) {
  const result = await pool.query(
    `select id, prev_record_hash, record_hash,
            encode(
              digest(
                convert_to(
                  jsonb_build_object(
                    'tenant_id', tenant_id,
                    'event_uuid', event_uuid,
                    'correlation_id', correlation_id,
                    'actor_id', actor_id,
                    'actor_role', actor_role,
                    'domain', domain,
                    'entity_type', entity_type,
                    'entity_id', entity_id,
                    'action', action,
                    'policy_version_id', policy_version_id,
                    'decision_context', decision_context,
                    'recorded_at', recorded_at
                  )::text || prev_record_hash,
                  'UTF8'
                ),
                'sha256'
              ),
              'hex'
            ) as expected_hash
       from governance.audit_logs
      where tenant_id = $1
      order by id asc`,
    [tenantId],
  );
  let expectedPrev = "0".repeat(64);
  let checked = 0;
  for (const row of result.rows) {
    checked += 1;
    if (row.prev_record_hash !== expectedPrev || row.record_hash !== row.expected_hash) {
      failures.push({ tenantId, checked, brokenAt: String(row.id) });
      return { tenantId, checked, valid: false, brokenAt: String(row.id) };
    }
    expectedPrev = row.record_hash;
  }
  return { tenantId, checked, valid: true, brokenAt: null };
}

async function main() {
  const tenants = await pool.query("select id::text, code from governance.tenants order by code");
  if (tenants.rowCount === 0) {
    throw new Error("Tidak ada tenant untuk diverifikasi");
  }
  for (const tenant of tenants.rows) {
    const result = await verifyTenant(tenant.id);
    console.log(
      `${result.valid ? "PASS" : "BROKEN"} audit-chain tenant=${tenant.code} checked=${result.checked} broken_at=${result.brokenAt ?? "-"}`,
    );
  }
  await closeDatabase();
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error("AUDIT_VERIFY_FAILED", error);
  await closeDatabase();
  process.exitCode = 1;
});
