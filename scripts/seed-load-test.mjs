import { createHash } from "node:crypto";

import { closeDatabase, pool } from "../packages/database/dist/index.js";

const SAU_TENANT = "019361a2-7c00-7000-8000-000000000001";
const SAU_BRANCH_BDG = "019361a2-7c00-7000-8000-000000000011";
const PEPPER = process.env.PII_PEPPER ?? "aletheia-demo-pepper";
const HEADCOUNT = 500;

function hash(value) {
  return createHash("sha256").update(`${PEPPER}:${value}`).digest("hex");
}

async function main() {
  const tenant = await pool.query("select 1 from governance.tenants where id = $1", [SAU_TENANT]);
  if (tenant.rowCount !== 1) {
    throw new Error("Tenant SAU tidak ditemukan. Jalankan pnpm db:seed terlebih dahulu.");
  }
  const policy = await pool.query(
    `select id from governance.policy_versions
      where tenant_id = $1 and domain = 'PAYROLL_TAX_POLICY'
      order by created_at desc limit 1`,
    [SAU_TENANT],
  );
  if (policy.rowCount === 0) {
    throw new Error("Policy payroll tidak ditemukan. Jalankan pnpm db:seed terlebih dahulu.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `delete from payroll.items
        where tenant_id = $1 and batch_id in (
          select id from payroll.batches
           where tenant_id = $1 and branch_id = $2
             and period_month between '2027-01-01' and '2027-05-31'
        )`,
      [SAU_TENANT, SAU_BRANCH_BDG],
    );
    await client.query(
      `delete from payroll.payments
        where tenant_id = $1 and batch_id in (
          select id from payroll.batches
           where tenant_id = $1 and branch_id = $2
             and period_month between '2027-01-01' and '2027-05-31'
        )`,
      [SAU_TENANT, SAU_BRANCH_BDG],
    );
    await client.query(
      `delete from payroll.payslips
        where tenant_id = $1 and batch_id in (
          select id from payroll.batches
           where tenant_id = $1 and branch_id = $2
             and period_month between '2027-01-01' and '2027-05-31'
        )`,
      [SAU_TENANT, SAU_BRANCH_BDG],
    );
    await client.query(
      `delete from payroll.batches
        where tenant_id = $1 and branch_id = $2
          and period_month between '2027-01-01' and '2027-05-31'`,
      [SAU_TENANT, SAU_BRANCH_BDG],
    );

    const personnel = [];
    for (let index = 1; index <= HEADCOUNT; index += 1) {
      const suffix = String(index).padStart(4, "0");
      const nik = `3273${String(index).padStart(12, "0")}`;
      const account = `8800${String(index).padStart(10, "0")}`;
      personnel.push({
        code: `LOAD-BDG-${suffix}`,
        name: `Load Employee ${suffix}`,
        nikHash: hash(nik),
        nikMasked: `3273****${suffix}`,
        accountHash: hash(account),
        accountMasked: `****${suffix}`,
      });
    }

    const values = [];
    const parameters = [SAU_TENANT, SAU_BRANCH_BDG];
    for (const [index, person] of personnel.entries()) {
      const offset = parameters.length;
      values.push(
        `(gen_random_uuid(), $1, $2, $${offset + 1}, 'EMPLOYEE', $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, 'BCA', 'Bank Central Asia', 'TK/0', 'I', 'PERMANENT', '5000000.00', '500000.00', '2026-01-01', true)`,
      );
      parameters.push(
        person.code,
        person.name,
        person.nikHash,
        person.nikMasked,
        person.accountHash,
        person.accountMasked,
      );
      if (index === HEADCOUNT - 1) {
        break;
      }
    }

    await client.query(
      `insert into payroll.personnel
        (id, tenant_id, branch_id, personnel_code, personnel_type, full_name,
         nik_hash, nik_masked, bank_account_hash, bank_account_masked, bank_code,
         bank_name, ptkp_status, risk_class, employment_status, base_salary,
         fixed_allowance, join_date, is_active)
       values ${values.join(",")}
       on conflict (tenant_id, personnel_code) do update set
         full_name = excluded.full_name,
         nik_hash = excluded.nik_hash,
         nik_masked = excluded.nik_masked,
         bank_account_hash = excluded.bank_account_hash,
         bank_account_masked = excluded.bank_account_masked,
         base_salary = excluded.base_salary,
         fixed_allowance = excluded.fixed_allowance,
         is_active = true`,
      parameters,
    );

    await client.query(
      `insert into payroll.attendance_summaries
        (id, tenant_id, personnel_id, period_month, working_days, present_days,
         paid_leave_days, unpaid_leave_days, absent_days, overtime_hours, source)
       select gen_random_uuid(), p.tenant_id, p.id, month_date, 22, 22, 0, 0, 0, 0, 'IMPORT'
         from payroll.personnel p
         cross join (values
           ('2027-01-01'::date), ('2027-02-01'::date), ('2027-03-01'::date),
           ('2027-04-01'::date), ('2027-05-01'::date)
         ) as months(month_date)
        where p.tenant_id = $1 and p.branch_id = $2 and p.is_active = true
       on conflict (tenant_id, personnel_id, period_month) do update set
         working_days = excluded.working_days,
         present_days = excluded.present_days,
         paid_leave_days = excluded.paid_leave_days,
         unpaid_leave_days = excluded.unpaid_leave_days,
         absent_days = excluded.absent_days,
         overtime_hours = excluded.overtime_hours,
         source = excluded.source,
         updated_at = now()`,
      [SAU_TENANT, SAU_BRANCH_BDG],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const counts = await pool.query(
    `select count(*)::int as total,
            count(*) filter (where personnel_code like 'LOAD-BDG-%')::int as load_test
       from payroll.personnel
      where tenant_id = $1 and branch_id = $2 and is_active = true`,
    [SAU_TENANT, SAU_BRANCH_BDG],
  );
  console.log(
    `PASS load-test seed tenant=SAU branch=BDG headcount=${counts.rows[0].total} load=${counts.rows[0].load_test}`,
  );
  await closeDatabase();
}

main().catch(async (error) => {
  console.error("LOAD_SEED_FAILED", error);
  await closeDatabase();
  process.exitCode = 1;
});
