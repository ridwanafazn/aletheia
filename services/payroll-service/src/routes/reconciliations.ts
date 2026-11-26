import { randomUUID } from "node:crypto";

import { pool } from "@aletheia/database";
import {
  TaxReconciliationListResponseSchema,
  TaxReconciliationRequestSchema,
  TaxReconciliationSchema,
  type TaxReconciliation,
} from "@aletheia/shared-contracts";
import { Decimal } from "decimal.js";
import { Router, type Router as RouterType } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";

import { appendAudit } from "../lib/audit.js";
import { ApiError } from "../lib/errors.js";
import { beginIdempotency, completeIdempotency } from "../lib/idempotency.js";
import { getActivePayrollPolicy } from "../lib/policy.js";
import { idempotencyRequestHash, requireIdempotencyKey } from "../lib/request-idempotency.js";
import { sendData } from "../lib/response.js";
import { requireRoles } from "../middleware/authorize.js";

const IdParamSchema = z.string().uuid();
const ListQuerySchema = z
  .object({ tax_year: z.coerce.number().int().min(2000).max(2100).optional() })
  .strict();

interface AggregateRow {
  personnel_id: string;
  personnel_code: string;
  full_name: string;
  ptkp_status: string;
  annual_gross: string;
  ter_credits: string;
  deductible_contributions: string;
}

interface ReconciliationRow {
  id: string;
  personnel_id: string;
  tax_year: number;
  policy_version_id: string;
  annual_gross: string;
  ptkp_amount: string;
  biaya_jabatan: string;
  deductible_contributions: string;
  annual_tax: string;
  ter_credits: string;
  difference: string;
  status: string;
  version: number;
  settlement_batch_id: string | null;
  settlement_item_id: string | null;
  posted_by: string | null;
  posted_at: Date | null;
  created_by: string;
}

function toReconciliation(row: ReconciliationRow): TaxReconciliation {
  return TaxReconciliationSchema.parse({
    ...row,
    posted_at: row.posted_at?.toISOString() ?? null,
  });
}

function computeAnnualTax(
  annualGross: Decimal,
  ptkp: Decimal,
  deductible: Decimal,
  rules: Awaited<ReturnType<typeof getActivePayrollPolicy>>["rules"],
): {
  biayaJabatan: Decimal;
  annualTax: Decimal;
  difference: Decimal;
  terCredits: Decimal;
} {
  let biayaJabatan = annualGross
    .mul(rules.annual_deductions.biaya_jabatan_rate)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const maximum = new Decimal(rules.annual_deductions.biaya_jabatan_max_annual);
  if (biayaJabatan.greaterThan(maximum)) {
    biayaJabatan = maximum;
  }
  const pkp = Decimal.max(0, annualGross.minus(biayaJabatan).minus(deductible).minus(ptkp));
  let annualTax = new Decimal(0);
  let lower = new Decimal(0);
  for (const bracket of rules.pph21_annual_brackets) {
    if (pkp.lessThanOrEqualTo(lower)) {
      break;
    }
    const upper = Decimal.min(pkp, bracket.max_pkp);
    if (upper.greaterThan(lower)) {
      annualTax = annualTax.plus(upper.minus(lower).mul(bracket.rate));
    }
    lower = new Decimal(bracket.max_pkp);
  }
  annualTax = annualTax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    biayaJabatan,
    annualTax,
    difference: annualTax,
    terCredits: new Decimal(0),
  };
}

async function annualAggregates(
  client: PoolClient,
  tenantId: string,
  taxYear: number,
  personnelId: string | undefined,
): Promise<AggregateRow[]> {
  const result = await client.query<AggregateRow>(
    `select i.personnel_id::text, p.personnel_code, p.full_name, p.ptkp_status,
            coalesce(sum(i.gross_income), 0)::text as annual_gross,
            coalesce(sum(i.pph21_tax_deduction), 0)::text as ter_credits,
            coalesce(sum(i.bpjs_jht_deduction + i.bpjs_jp_deduction), 0)::text as deductible_contributions
       from payroll.items i
       join payroll.batches b on b.id = i.batch_id and b.tenant_id = i.tenant_id
       join payroll.personnel p on p.id = i.personnel_id and p.tenant_id = i.tenant_id
      where i.tenant_id = $1
        and b.status in ('APPROVED', 'DISBURSING', 'DISBURSED', 'PARTIAL')
        and b.period_month >= make_date($2, 1, 1)
        and b.period_month < make_date($2 + 1, 1, 1)
        and ($3::uuid is null or i.personnel_id = $3::uuid)
      group by i.personnel_id, p.personnel_code, p.full_name, p.ptkp_status
      order by p.personnel_code`,
    [tenantId, taxYear, personnelId ?? null],
  );
  return result.rows;
}

export const reconciliationRouter: RouterType = Router();

reconciliationRouter.post(
  "/",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const input = TaxReconciliationRequestSchema.parse(request.body);
    const key = requireIdempotencyKey(request);
    const requestHash = idempotencyRequestHash(input);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const idempotency = await beginIdempotency(client, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        scope: "POST:/api/v1/payroll/reconciliations",
        key,
        requestHash,
      });
      if (idempotency.kind === "replay") {
        await client.query("ROLLBACK");
        response.setHeader("x-idempotent-replay", "true");
        sendData(response, idempotency.response.data, 200);
        return;
      }
      const policy = await getActivePayrollPolicy(client, auth.tenantId);
      const aggregates = await annualAggregates(
        client,
        auth.tenantId,
        input.tax_year,
        input.personnel_id,
      );
      if (aggregates.length === 0) {
        throw ApiError.policyViolation("Tidak ada item payroll pada tahun pajak tersebut");
      }
      const created: TaxReconciliation[] = [];
      for (const row of aggregates) {
        const ptkpValue =
          policy.rules.ptkp_amounts[row.ptkp_status as keyof typeof policy.rules.ptkp_amounts];
        if (ptkpValue === undefined) {
          throw ApiError.policyViolation(`PTKP ${row.ptkp_status} tidak ada pada kebijakan`);
        }
        const gross = new Decimal(row.annual_gross);
        const credits = new Decimal(row.ter_credits);
        const deductible = new Decimal(row.deductible_contributions);
        const computed = computeAnnualTax(gross, new Decimal(ptkpValue), deductible, policy.rules);
        const difference = computed.annualTax.minus(credits);
        const versionResult = await client.query<{ next_version: number }>(
          `select coalesce(max(version), 0) + 1 as next_version
             from payroll.tax_reconciliations
            where tenant_id = $1 and personnel_id = $2 and tax_year = $3`,
          [auth.tenantId, row.personnel_id, input.tax_year],
        );
        const id = randomUUID();
        const inserted = await client.query<ReconciliationRow>(
          `insert into payroll.tax_reconciliations
             (id, tenant_id, personnel_id, tax_year, policy_version_id, annual_gross,
              ptkp_amount, biaya_jabatan, deductible_contributions, annual_tax, ter_credits,
              difference, status, version, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'DRAFT',$13,$14)
           returning id, personnel_id, tax_year, policy_version_id, annual_gross::text,
                     ptkp_amount::text, biaya_jabatan::text, deductible_contributions::text,
                     annual_tax::text, ter_credits::text, difference::text, status, version,
                     settlement_batch_id, settlement_item_id, posted_by, posted_at, created_by`,
          [
            id,
            auth.tenantId,
            row.personnel_id,
            input.tax_year,
            policy.id,
            gross.toFixed(2),
            new Decimal(ptkpValue).toFixed(2),
            computed.biayaJabatan.toFixed(2),
            deductible.toFixed(2),
            computed.annualTax.toFixed(2),
            credits.toFixed(2),
            difference.toFixed(2),
            versionResult.rows[0]?.next_version ?? 1,
            auth.userId,
          ],
        );
        created.push(toReconciliation(inserted.rows[0]!));
      }
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "PAYROLL",
          entityType: "TAX_RECONCILIATION",
          entityId: created[0]!.id,
          action: "TAX_RECONCILIATION_CREATED",
          policyVersionId: policy.id,
          decisionContext: {
            tax_year: input.tax_year,
            personnel_count: created.length,
            total_difference: created
              .reduce((sum, row) => sum.plus(row.difference), new Decimal(0))
              .toFixed(2),
          },
          correlationId: request.correlationId,
        },
        client,
      );
      const payload = { items: created };
      await completeIdempotency(client, idempotency.recordId, {
        status: 201,
        data: payload as unknown as Record<string, unknown>,
      });
      await client.query("COMMIT");
      sendData(response, payload, 201);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
);

reconciliationRouter.get(
  "/",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const query = ListQuerySchema.parse(request.query);
    const result = await pool.query<ReconciliationRow>(
      `select id, personnel_id, tax_year, policy_version_id, annual_gross::text,
              ptkp_amount::text, biaya_jabatan::text, deductible_contributions::text,
              annual_tax::text, ter_credits::text, difference::text, status, version,
              settlement_batch_id, settlement_item_id, posted_by, posted_at, created_by
         from payroll.tax_reconciliations
        where tenant_id = $1
          and ($2::smallint is null or tax_year = $2::smallint)
        order by tax_year desc, personnel_id, version desc`,
      [auth.tenantId, query.tax_year ?? null],
    );
    const payload = { items: result.rows.map(toReconciliation) };
    TaxReconciliationListResponseSchema.parse(payload);
    sendData(response, payload);
  },
);

reconciliationRouter.post(
  "/:id/post",
  requireRoles("FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const key = requireIdempotencyKey(request);
    const requestHash = idempotencyRequestHash({ id });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const idempotency = await beginIdempotency(client, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        scope: `POST:/api/v1/payroll/reconciliations/${id}/post`,
        key,
        requestHash,
      });
      if (idempotency.kind === "replay") {
        await client.query("ROLLBACK");
        response.setHeader("x-idempotent-replay", "true");
        sendData(response, idempotency.response.data, 200);
        return;
      }
      const existing = await client.query<ReconciliationRow>(
        `select id, personnel_id, tax_year, policy_version_id, annual_gross::text,
                ptkp_amount::text, biaya_jabatan::text, deductible_contributions::text,
                annual_tax::text, ter_credits::text, difference::text, status, version,
                settlement_batch_id, settlement_item_id, posted_by, posted_at, created_by
           from payroll.tax_reconciliations
          where tenant_id = $1 and id = $2
          for update`,
        [auth.tenantId, id],
      );
      const row = existing.rows[0];
      if (row === undefined) {
        throw ApiError.notFound("Rekonsiliasi tidak ditemukan");
      }
      if (row.created_by === auth.userId) {
        throw new ApiError(
          403,
          "ERR_SOD_VIOLATION",
          "Pembuat rekonsiliasi tidak boleh memposting rekonsiliasi yang sama",
        );
      }
      if (row.status !== "DRAFT") {
        throw new ApiError(409, "ERR_CONCURRENT_LOCK", "Rekonsiliasi sudah diposting");
      }
      const updated = await client.query<ReconciliationRow>(
        `update payroll.tax_reconciliations
            set status = 'POSTED', posted_by = $3, posted_at = now()
          where tenant_id = $1 and id = $2
          returning id, personnel_id, tax_year, policy_version_id, annual_gross::text,
                    ptkp_amount::text, biaya_jabatan::text, deductible_contributions::text,
                    annual_tax::text, ter_credits::text, difference::text, status, version,
                    settlement_batch_id, settlement_item_id, posted_by, posted_at, created_by`,
        [auth.tenantId, id, auth.userId],
      );
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "PAYROLL",
          entityType: "TAX_RECONCILIATION",
          entityId: id,
          action: "TAX_RECONCILIATION_POSTED",
          policyVersionId: row.policy_version_id,
          decisionContext: {
            tax_year: row.tax_year,
            personnel_id: row.personnel_id,
            difference: row.difference,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      const payload = toReconciliation(updated.rows[0]!);
      await completeIdempotency(client, idempotency.recordId, {
        status: 200,
        data: payload as unknown as Record<string, unknown>,
      });
      await client.query("COMMIT");
      sendData(response, payload);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
);
