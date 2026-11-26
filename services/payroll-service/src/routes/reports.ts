import { randomUUID } from "node:crypto";

import { pool } from "@aletheia/database";
import {
  FileDownloadResponseSchema,
  GenerateReportRequestSchema,
  PayslipGenerateResponseSchema,
  PayslipListQuerySchema,
  PayslipPageSchema,
  PayslipSchema,
  ReportListQuerySchema,
  TaxReportPageSchema,
  TaxReportSchema,
} from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";
import { z } from "zod";

import { appendAudit } from "../lib/audit.js";
import { getBatchItems } from "../lib/batch-model.js";
import { ApiError } from "../lib/errors.js";
import { beginIdempotency, completeIdempotency } from "../lib/idempotency.js";
import { decodeCursor, encodeCursor } from "../lib/pagination.js";
import { signFileToken, signedFilePath } from "../lib/files.js";
import { getActivePayrollPolicy } from "../lib/policy.js";
import {
  buildPayslipGenerateEvent,
  buildReportGenerateEvent,
  publishPayrollEvent,
} from "../lib/qstash.js";
import { idempotencyRequestHash, requireIdempotencyKey } from "../lib/request-idempotency.js";
import { sendData } from "../lib/response.js";
import { requireRoles } from "../middleware/authorize.js";
import { lockBatch } from "./batches.js";

const IdParamSchema = z.string().uuid();

interface ReportRow {
  id: string;
  report_type: string;
  branch_id: string | null;
  policy_version_id: string;
  period_start: string;
  period_end: string;
  version: number;
  status: string;
  file_url: string | null;
  snapshot_hash_sha256: string | null;
  file_checksum_sha256: string | null;
  total_gross: string;
  total_employee_bpjs: string;
  total_employer_bpjs: string;
  total_pph21: string;
  total_net: string;
  headcount: number;
  reconciliation_delta: string;
  totals: Record<string, unknown>;
  generated_by: string | null;
  generated_at: Date | null;
  error_message: string | null;
  supersedes_id: string | null;
}

const REPORT_COLUMNS = `
  id, report_type, branch_id, policy_version_id, period_start::text as period_start,
  period_end::text as period_end, version, status, file_url, snapshot_hash_sha256,
  file_checksum_sha256, total_gross, total_employee_bpjs, total_employer_bpjs,
  total_pph21, total_net, headcount, reconciliation_delta, totals, generated_by,
  generated_at, error_message, supersedes_id`;

function toReport(row: ReportRow) {
  return TaxReportSchema.parse({
    ...row,
    generated_at: row.generated_at?.toISOString() ?? null,
  });
}

interface PayslipRow {
  id: string;
  batch_id: string;
  personnel_id: string;
  period_month: string;
  version: number;
  secure_url: string;
  snapshot_hash_sha256: string;
  file_checksum_sha256: string;
  gross_income: string;
  net_take_home_pay: string;
  verification_code: string;
  published_at: Date | null;
  viewed_at: Date | null;
  supersedes_id: string | null;
}

function toPayslip(row: PayslipRow) {
  return PayslipSchema.parse({
    id: row.id,
    batch_id: row.batch_id,
    personnel_id: row.personnel_id,
    period_month: row.period_month,
    version: row.version,
    secure_url: row.secure_url,
    snapshot_hash_sha256: row.snapshot_hash_sha256,
    file_checksum_sha256: row.file_checksum_sha256,
    gross_income: row.gross_income,
    net_take_home_pay: row.net_take_home_pay,
    verification_code: row.verification_code,
    published_at: row.published_at?.toISOString() ?? null,
    viewed_at: row.viewed_at?.toISOString() ?? null,
    supersedes_id: row.supersedes_id,
  });
}

export const reportRouter: RouterType = Router();

reportRouter.post(
  "/",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const input = GenerateReportRequestSchema.parse(request.body);
    const key = requireIdempotencyKey(request);
    const requestHash = idempotencyRequestHash(input);
    const client = await pool.connect();
    let event: ReturnType<typeof buildReportGenerateEvent> | undefined;

    try {
      await client.query("BEGIN");
      const idempotency = await beginIdempotency(client, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        scope: "POST:/api/v1/reports",
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
      const branchId = input.branch_id ?? null;
      if (branchId !== null) {
        const branch = await client.query(
          `select 1 from governance.branches where id = $1 and tenant_id = $2`,
          [branchId, auth.tenantId],
        );
        if (branch.rowCount !== 1) {
          throw ApiError.notFound("Cabang tidak ditemukan pada tenant ini");
        }
      }

      const previous = await client.query<{ version: number; previous_id: string | null }>(
        `select coalesce(max(version), 0) + 1 as version,
                (array_agg(id order by version desc))[1] as previous_id
           from payroll.tax_reports
          where tenant_id = $1
            and report_type = $2
            and branch_id is not distinct from $3
            and period_start = $4::date
            and period_end = $5::date`,
        [auth.tenantId, input.report_type, branchId, input.period_start, input.period_end],
      );
      const version = previous.rows[0]?.version ?? 1;
      const supersedesId = previous.rows[0]?.previous_id ?? null;
      const id = randomUUID();

      const inserted = await client.query<ReportRow>(
        `insert into payroll.tax_reports
          (id, tenant_id, report_type, branch_id, policy_version_id, period_start, period_end,
           version, status, totals, generated_by, generated_at, supersedes_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED',$9,$10,now(),$11)
         returning ${REPORT_COLUMNS}`,
        [
          id,
          auth.tenantId,
          input.report_type,
          branchId,
          policy.id,
          input.period_start,
          input.period_end,
          version,
          { request_source: "payroll-service" },
          auth.userId,
          supersedesId,
        ],
      );

      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "PAYROLL",
          entityType: "TAX_REPORT",
          entityId: id,
          action: "REPORT_REQUESTED",
          policyVersionId: policy.id,
          decisionContext: {
            report_type: input.report_type,
            period_start: input.period_start,
            period_end: input.period_end,
            branch_id: branchId,
            version,
            supersedes_id: supersedesId,
          },
          correlationId: request.correlationId,
        },
        client,
      );

      const report = toReport(inserted.rows[0]!);
      await completeIdempotency(client, idempotency.recordId, {
        status: 202,
        data: report as unknown as Record<string, unknown>,
      });
      event = buildReportGenerateEvent({
        tenantId: auth.tenantId,
        correlationId: request.correlationId,
        requestedBy: auth.userId,
        reportId: id,
        reportType: input.report_type,
        policyVersionId: policy.id,
        periodStart: input.period_start,
        periodEnd: input.period_end,
        branchId,
      });
      await client.query("COMMIT");
      sendData(response, report, 202);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    if (event !== undefined) {
      await publishPayrollEvent(event);
    }
  },
);

reportRouter.get(
  "/",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const query = ReportListQuerySchema.parse(request.query);
    const conditions = ["tenant_id = $1"];
    const values: unknown[] = [auth.tenantId];
    if (query.report_type !== undefined) {
      values.push(query.report_type);
      conditions.push(`report_type = $${values.length}`);
    }
    if (query.period_month !== undefined) {
      values.push(query.period_month);
      conditions.push(
        `period_start >= $${values.length}::date and period_start < ($${values.length}::date + interval '1 month')`,
      );
    }
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor);
      values.push(cursor.createdAt, cursor.id);
      conditions.push(
        `(period_start, id) < ($${values.length - 1}::date, $${values.length}::uuid)`,
      );
    }
    values.push(query.limit + 1);

    const result = await pool.query<ReportRow>(
      `select ${REPORT_COLUMNS}
         from payroll.tax_reports
        where ${conditions.join(" AND ")}
        order by period_start desc, id desc
        limit $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > query.limit;
    const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const last = rows.at(-1);
    const data = {
      items: rows.map(toReport),
      meta: {
        next_cursor:
          hasMore && last !== undefined ? encodeCursor(last.period_start, last.id) : null,
        has_more: hasMore,
      },
    };
    TaxReportPageSchema.parse(data);
    sendData(response, data);
  },
);

reportRouter.get(
  "/:id",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const result = await pool.query<ReportRow>(
      `select ${REPORT_COLUMNS} from payroll.tax_reports
        where tenant_id = $1 and id = $2 limit 1`,
      [auth.tenantId, id],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw ApiError.notFound("Laporan tidak ditemukan");
    }
    sendData(response, toReport(row));
  },
);

reportRouter.get(
  "/:id/download",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const result = await pool.query<ReportRow>(
      `select ${REPORT_COLUMNS} from payroll.tax_reports
        where tenant_id = $1 and id = $2 limit 1`,
      [auth.tenantId, id],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw ApiError.notFound("Laporan tidak ditemukan");
    }
    if (row.status !== "READY" || row.file_url === null || row.file_checksum_sha256 === null) {
      throw new ApiError(409, "ERR_REPORT_NOT_READY", "Laporan belum selesai dibuat");
    }
    const file = await pool.query(
      `select 1 from payroll.generated_files
        where tenant_id = $1 and kind = 'REPORT' and entity_id = $2 limit 1`,
      [auth.tenantId, id],
    );
    if (file.rowCount !== 1) {
      throw new ApiError(409, "ERR_REPORT_NOT_READY", "Berkas laporan belum tersedia");
    }
    const signed = signFileToken({ tenantId: auth.tenantId, kind: "REPORT", entityId: id });
    await appendAudit({
      tenantId: auth.tenantId,
      actorId: auth.userId,
      actorRole: auth.role,
      domain: "PAYROLL",
      entityType: "TAX_REPORT",
      entityId: id,
      action: "REPORT_DOWNLOADED",
      policyVersionId: row.policy_version_id,
      decisionContext: {
        report_type: row.report_type,
        version: row.version,
        checksum: row.file_checksum_sha256,
      },
      correlationId: request.correlationId,
    });
    sendData(
      response,
      FileDownloadResponseSchema.parse({
        url: signedFilePath(signed.token),
        checksum: row.file_checksum_sha256,
        expires_at: signed.expiresAt,
      }),
    );
  },
);

export const payslipRouter: RouterType = Router();

payslipRouter.get(
  "/",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const query = PayslipListQuerySchema.parse(request.query);
    const conditions = ["tenant_id = $1"];
    const values: unknown[] = [auth.tenantId];
    if (query.period_month !== undefined) {
      values.push(query.period_month);
      conditions.push(`period_month = $${values.length}::date`);
    }
    if (query.personnel_id !== undefined) {
      values.push(query.personnel_id);
      conditions.push(`personnel_id = $${values.length}`);
    }
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor);
      values.push(cursor.createdAt, cursor.id);
      conditions.push(
        `(period_month, id) < ($${values.length - 1}::date, $${values.length}::uuid)`,
      );
    }
    values.push(query.limit + 1);

    const result = await pool.query<PayslipRow>(
      `select id, batch_id, personnel_id, period_month::text as period_month, version,
              secure_url, snapshot_hash_sha256, file_checksum_sha256, gross_income::text,
              net_take_home_pay::text, verification_code, published_at, viewed_at, supersedes_id
         from payroll.payslips
        where ${conditions.join(" AND ")}
        order by period_month desc, id desc
        limit $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > query.limit;
    const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const last = rows.at(-1);
    const data = {
      items: rows.map(toPayslip),
      meta: {
        next_cursor:
          hasMore && last !== undefined ? encodeCursor(last.period_month, last.id) : null,
        has_more: hasMore,
      },
    };
    PayslipPageSchema.parse(data);
    sendData(response, data);
  },
);

payslipRouter.get(
  "/:id/download",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const result = await pool.query<PayslipRow>(
      `select id, batch_id, personnel_id, period_month::text as period_month, version,
              secure_url, snapshot_hash_sha256, file_checksum_sha256, gross_income::text,
              net_take_home_pay::text, verification_code, published_at, viewed_at, supersedes_id
         from payroll.payslips
        where tenant_id = $1 and id = $2 limit 1`,
      [auth.tenantId, id],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw ApiError.notFound("Payslip tidak ditemukan");
    }
    const file = await pool.query<{ checksum_sha256: string }>(
      `select checksum_sha256 from payroll.generated_files
        where tenant_id = $1 and kind = 'PAYSLIP' and entity_id = $2 limit 1`,
      [auth.tenantId, id],
    );
    const fileRow = file.rows[0];
    if (fileRow === undefined) {
      throw new ApiError(409, "ERR_REPORT_NOT_READY", "Berkas payslip belum tersedia");
    }
    const signed = signFileToken({ tenantId: auth.tenantId, kind: "PAYSLIP", entityId: id });
    await appendAudit({
      tenantId: auth.tenantId,
      actorId: auth.userId,
      actorRole: auth.role,
      domain: "PAYROLL",
      entityType: "PAYSLIP",
      entityId: id,
      action: "PAYSLIP_DOWNLOADED",
      policyVersionId: null,
      decisionContext: {
        batch_id: row.batch_id,
        personnel_id: row.personnel_id,
        version: row.version,
        checksum: fileRow.checksum_sha256,
      },
      correlationId: request.correlationId,
    });
    sendData(
      response,
      FileDownloadResponseSchema.parse({
        url: signedFilePath(signed.token),
        checksum: fileRow.checksum_sha256,
        expires_at: signed.expiresAt,
      }),
    );
  },
);

payslipRouter.get(
  "/:id",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const result = await pool.query<PayslipRow>(
      `select id, batch_id, personnel_id, period_month::text as period_month, version,
              secure_url, snapshot_hash_sha256, file_checksum_sha256, gross_income::text,
              net_take_home_pay::text, verification_code, published_at, viewed_at, supersedes_id
         from payroll.payslips
        where tenant_id = $1 and id = $2 limit 1`,
      [auth.tenantId, id],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw ApiError.notFound("Payslip tidak ditemukan");
    }
    sendData(response, toPayslip(row));
  },
);

export const payslipRequestRouter: RouterType = Router();

payslipRequestRouter.post(
  "/:id/payslips",
  requireRoles("HR_SPECIALIST"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const key = requireIdempotencyKey(request);
    const requestHash = idempotencyRequestHash({ batch_id: id });
    const client = await pool.connect();
    let event: ReturnType<typeof buildPayslipGenerateEvent> | undefined;

    try {
      await client.query("BEGIN");
      const batch = await lockBatch(client, auth.tenantId, id);
      const idempotency = await beginIdempotency(client, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        scope: `POST:/api/v1/payroll/batches/${id}/payslips`,
        key,
        requestHash,
      });
      if (idempotency.kind === "replay") {
        await client.query("ROLLBACK");
        response.setHeader("x-idempotent-replay", "true");
        sendData(response, idempotency.response.data, 200);
        return;
      }
      if (!["APPROVED", "DISBURSED"].includes(batch.status)) {
        throw new ApiError(
          409,
          "ERR_CONCURRENT_LOCK",
          "Payslip hanya untuk batch APPROVED atau DISBURSED",
        );
      }
      const items = await getBatchItems(client, auth.tenantId, id);
      if (items.length === 0) {
        throw ApiError.policyViolation("Batch belum memiliki item");
      }

      event = buildPayslipGenerateEvent({
        tenantId: auth.tenantId,
        correlationId: request.correlationId,
        requestedBy: auth.userId,
        batchId: id,
        policyVersionId: batch.policy_version_id,
        periodMonth: batch.period_month,
        itemCount: items.length,
      });
      const payload = PayslipGenerateResponseSchema.parse({
        batch_id: id,
        period_month: batch.period_month,
        policy_version_id: batch.policy_version_id,
        item_count: items.length,
        status: "QUEUED",
        event_id: event.event_id,
      });
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "PAYROLL",
          entityType: "PAYROLL_BATCH",
          entityId: id,
          action: "PAYSLIP_GENERATION_REQUESTED",
          policyVersionId: batch.policy_version_id,
          decisionContext: {
            batch_code: batch.batch_code,
            period_month: batch.period_month,
            item_count: items.length,
            event_id: event.event_id,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      await completeIdempotency(client, idempotency.recordId, {
        status: 202,
        data: payload,
      });
      await client.query("COMMIT");
      sendData(response, payload, 202);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    if (event !== undefined) {
      await publishPayrollEvent(event);
    }
  },
);
