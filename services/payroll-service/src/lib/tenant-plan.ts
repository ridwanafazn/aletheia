import { pool } from "@aletheia/database";
import {
  TenantPlanSchema,
  tenantPlanHasFeature,
  type TenantFeature,
  type TenantPlan,
} from "@aletheia/shared-contracts";
import type { NextFunction, Request, Response } from "express";

import { ApiError } from "./errors.js";

export async function getTenantPlan(tenantId: string): Promise<TenantPlan> {
  const result = await pool.query<{ plan: string }>(
    `select plan from governance.tenants where id = $1 and status = 'ACTIVE'`,
    [tenantId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw ApiError.notFound("Tenant tidak ditemukan");
  }
  return TenantPlanSchema.parse(row.plan);
}

export async function assertTenantFeature(tenantId: string, feature: TenantFeature): Promise<void> {
  const plan = await getTenantPlan(tenantId);
  if (!tenantPlanHasFeature(plan, feature)) {
    throw new ApiError(
      403,
      "ERR_PLAN_FEATURE_UNAVAILABLE",
      `Fitur ${feature} tidak tersedia pada paket ${plan}`,
    );
  }
}

export function requireTenantFeature(feature: TenantFeature) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      await assertTenantFeature(request.auth!.tenantId, feature);
      next();
    } catch (error) {
      next(error);
    }
  };
}
