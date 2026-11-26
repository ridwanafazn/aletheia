import { pool } from "@aletheia/database";
import {
  TenantPlanSchema,
  TenantProfileSchema,
  tenantPlanFeatures,
} from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";

import { ApiError } from "../lib/errors.js";
import { sendData } from "../lib/response.js";
import { requireAuthenticated } from "../middleware/authorize.js";

interface TenantRow {
  code: string;
  name: string;
  plan: string;
}

export const tenantRouter: RouterType = Router();

tenantRouter.get("/", requireAuthenticated, async (request, response) => {
  const auth = request.auth!;
  const result = await pool.query<TenantRow>(
    `select code, name, plan from governance.tenants where id = $1 and status = 'ACTIVE'`,
    [auth.tenantId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw ApiError.notFound("Tenant tidak ditemukan");
  }
  const plan = TenantPlanSchema.parse(row.plan);
  sendData(
    response,
    TenantProfileSchema.parse({
      code: row.code,
      name: row.name,
      plan,
      features: tenantPlanFeatures(plan),
    }),
  );
});
