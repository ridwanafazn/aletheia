import { pool } from "@aletheia/database";
import { WhatIfRunResponseSchema, WhatIfSimulationRequestSchema } from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";
import { z } from "zod";

import { appendAudit } from "../lib/audit.js";
import { buildWhatIfEvent, publishWhatIfEvent } from "../lib/qstash.js";
import { sendData } from "../lib/response.js";
import { requireRoles } from "../middleware/authorize.js";

const MonthSchema = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/);
const LimitSchema = z.coerce.number().int().min(1).max(50).default(10);
const TrendSchema = z.coerce.number().int().min(1).max(24).default(6);

interface KpiRow {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  report_month: string;
  total_claims_submitted: number;
  total_claims_approved: number;
  total_claims_approved_amount: string;
  claim_approval_rate_pct: string;
  avg_turnaround_hours: string;
  total_payroll_disbursed: string;
  total_pph21_collected: string;
  budget_utilization_pct: string;
  mom_variance_pct: string;
}

interface WhatIfRow {
  id: string;
  simulation_name: string;
  base_policy_version_tag: string | null;
  actual_total_cost: string;
  simulated_total_cost: string;
  variance_amount: string;
  variance_percentage: string;
  impact_breakdown: Record<string, unknown>;
  created_at: Date;
}

const CACHE_TTL_MS = 300_000;
const cache = new Map<string, { expiresAt: number; value: unknown }>();

function cacheKey(tenantId: string, scope: string): string {
  return `${tenantId}:${scope}`;
}

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry === undefined || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function cacheSet(key: string, value: unknown): void {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

function normalizeMonth(value: string): string {
  const parsed = MonthSchema.parse(value);
  return parsed.length === 7 ? `${parsed}-01` : parsed;
}

async function queryKpi(input: {
  tenantId: string;
  month: string;
  branchId: string | null;
}): Promise<KpiRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("select set_config('app.tenant_id', $1, true)", [input.tenantId]);
    const result = await client.query<KpiRow>(
      `select branch_id, branch_code, branch_name, report_month::text as report_month,
              total_claims_submitted, total_claims_approved, total_claims_approved_amount,
              claim_approval_rate_pct, avg_turnaround_hours, total_payroll_disbursed,
              total_pph21_collected, budget_utilization_pct, mom_variance_pct
         from analytics.v_mis_monthly_kpi
        where report_month = $1::date
          and ($2::uuid is null or branch_id = $2::uuid)
        order by branch_code asc`,
      [input.month, input.branchId],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function queryTrend(input: {
  tenantId: string;
  month: string;
  branchId: string | null;
  months: number;
}): Promise<KpiRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("select set_config('app.tenant_id', $1, true)", [input.tenantId]);
    const result = await client.query<KpiRow>(
      `select branch_id, branch_code, branch_name, report_month::text as report_month,
              total_claims_submitted, total_claims_approved, total_claims_approved_amount,
              claim_approval_rate_pct, avg_turnaround_hours, total_payroll_disbursed,
              total_pph21_collected, budget_utilization_pct, mom_variance_pct
         from analytics.v_mis_monthly_kpi
        where report_month <= $1::date
          and report_month > ($1::date - ($3::int * interval '1 month'))
          and ($2::uuid is null or branch_id = $2::uuid)
        order by report_month asc, branch_code asc`,
      [input.month, input.branchId, input.months],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export const analyticsRouter: RouterType = Router();

analyticsRouter.get(
  "/mis-summary",
  requireRoles("MIS_ANALYST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const month = normalizeMonth(z.string().parse(request.query.report_month));
    const branchId =
      request.query.branch_id === undefined
        ? null
        : z.string().uuid().parse(request.query.branch_id);
    const key = cacheKey(auth.tenantId, `kpi:${month}:${branchId ?? "all"}`);
    const cached = cacheGet<KpiRow[]>(key);
    if (cached !== null) {
      response.setHeader("x-cache", "HIT");
      sendData(response, { items: cached });
      return;
    }
    const rows = await queryKpi({ tenantId: auth.tenantId, month, branchId });
    cacheSet(key, rows);
    response.setHeader("x-cache", "MISS");
    sendData(response, { items: rows });
  },
);

analyticsRouter.get(
  "/mis-trend",
  requireRoles("MIS_ANALYST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const month = normalizeMonth(z.string().parse(request.query.report_month));
    const months = TrendSchema.parse(request.query.months ?? "6");
    const branchId =
      request.query.branch_id === undefined
        ? null
        : z.string().uuid().parse(request.query.branch_id);
    const key = cacheKey(auth.tenantId, `trend:${month}:${branchId ?? "all"}:${months}`);
    const cached = cacheGet<KpiRow[]>(key);
    if (cached !== null) {
      response.setHeader("x-cache", "HIT");
      sendData(response, { items: cached });
      return;
    }
    const rows = await queryTrend({ tenantId: auth.tenantId, month, branchId, months });
    cacheSet(key, rows);
    response.setHeader("x-cache", "MISS");
    sendData(response, { items: rows });
  },
);

analyticsRouter.get(
  "/what-if",
  requireRoles("MIS_ANALYST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const limit = LimitSchema.parse(request.query.limit ?? "10");
    const result = await pool.query<WhatIfRow>(
      `select w.id, w.simulation_name, p.version_tag as base_policy_version_tag,
              w.actual_total_cost, w.simulated_total_cost, w.variance_amount,
              w.variance_percentage, w.impact_breakdown, w.created_at
         from analytics.what_if_simulations w
         left join governance.policy_versions p
           on p.id = w.base_policy_version_id
          and p.tenant_id = w.tenant_id
        where w.tenant_id = $1
        order by w.created_at desc
        limit $2`,
      [auth.tenantId, limit],
    );
    sendData(response, { items: result.rows });
  },
);

analyticsRouter.post(
  "/what-if",
  requireRoles("MIS_ANALYST", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const input = WhatIfSimulationRequestSchema.parse(request.body);
    const event = buildWhatIfEvent({
      tenantId: auth.tenantId,
      correlationId: request.correlationId,
      requestedBy: auth.userId,
      request: input,
    });
    const enqueued = await publishWhatIfEvent(event);
    await appendAudit({
      tenantId: auth.tenantId,
      actorId: auth.userId,
      actorRole: auth.role,
      domain: "ANALYTICS",
      entityType: "WHAT_IF_SIMULATION",
      entityId: event.event_id,
      action: "WHAT_IF_REQUESTED",
      policyVersionId: input.base_policy_version_id,
      decisionContext: {
        simulation_name: input.simulation_name,
        target_period_start: input.target_period_start,
        target_period_end: input.target_period_end,
        branch_id: input.branch_id ?? null,
        enqueued,
      },
      correlationId: request.correlationId,
      eventUuid: event.event_id,
    });
    sendData(
      response,
      WhatIfRunResponseSchema.parse({
        event_id: event.event_id,
        status: "QUEUED",
        enqueued,
        requested_at: event.requested_at,
      }),
      202,
    );
  },
);

analyticsRouter.post(
  "/cache/invalidate",
  requireRoles("MIS_ANALYST", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const prefix = `${auth.tenantId}:`;
    let invalidated = 0;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
        invalidated += 1;
      }
    }
    sendData(response, { invalidated });
  },
);
