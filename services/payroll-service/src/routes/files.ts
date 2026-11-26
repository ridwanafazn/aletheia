import { pool, runWithTenant } from "@aletheia/database";
import { tenantPlanHasFeature } from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";

import { verifyFileToken } from "../lib/files.js";
import { getTenantPlan } from "../lib/tenant-plan.js";

interface FileRow {
  file_name: string;
  mime_type: string;
  file_size: number;
  content: Buffer;
  checksum_sha256: string;
  report_type: string | null;
}

export const fileRouter: RouterType = Router();

fileRouter.get("/:token", async (request, response) => {
  const token = request.params.token ?? "";
  const payload = verifyFileToken(token);
  if (payload === null) {
    response.status(401).json({
      success: false,
      correlation_id: request.correlationId,
      data: null,
      error: {
        code: "ERR_UNAUTHORIZED_ACCESS",
        message: "Tautan berkas tidak valid atau sudah kedaluwarsa",
        correlation_id: request.correlationId,
        retryable: false,
      },
    });
    return;
  }
  const result = await runWithTenant(payload.tenant_id, () =>
    pool.query<FileRow>(
      `select gf.file_name, gf.mime_type, gf.file_size, gf.content, gf.checksum_sha256,
              tr.report_type
         from payroll.generated_files gf
         left join payroll.tax_reports tr
           on tr.id = gf.entity_id and tr.tenant_id = gf.tenant_id
        where gf.tenant_id = $1 and gf.kind = $2 and gf.entity_id = $3
        limit 1`,
      [payload.tenant_id, payload.kind, payload.entity_id],
    ),
  );
  const file = result.rows[0];
  if (file === undefined) {
    response.status(404).json({
      success: false,
      correlation_id: request.correlationId,
      data: null,
      error: {
        code: "ERR_NOT_FOUND",
        message: "Berkas tidak ditemukan",
        correlation_id: request.correlationId,
        retryable: false,
      },
    });
    return;
  }
  if (payload.kind === "REPORT" && file.report_type === "PAYROLL_COST_INVOICE") {
    const plan = await getTenantPlan(payload.tenant_id);
    if (!tenantPlanHasFeature(plan, "PAYROLL_COST_INVOICE")) {
      response.status(403).json({
        success: false,
        correlation_id: request.correlationId,
        data: null,
        error: {
          code: "ERR_PLAN_FEATURE_UNAVAILABLE",
          message: "Fitur PAYROLL_COST_INVOICE tidak tersedia pada paket tenant",
          correlation_id: request.correlationId,
          retryable: false,
        },
      });
      return;
    }
  }
  response.setHeader("content-type", file.mime_type);
  response.setHeader("content-length", String(file.file_size));
  response.setHeader("content-disposition", `attachment; filename="${file.file_name}"`);
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("x-file-checksum-sha256", file.checksum_sha256);
  response.send(file.content);
});
