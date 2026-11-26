import { z } from "zod";

import { apiFailureSchema, apiResponseSchema } from "./api.js";
import { LoginRequestSchema, LoginResponseSchema } from "./auth.js";
import {
  ClaimDetailSchema,
  ClaimPaymentSchema,
  ClaimSummaryPageSchema,
  ClaimSummarySchema,
  ComplianceReviewRequestSchema,
  CreateClaimRequestSchema,
  DecideClaimRequestSchema,
  DisburseClaimRequestSchema,
  UpdateClaimRequestSchema,
  UploadSignatureRequestSchema,
  UploadSignatureResponseSchema,
} from "./claims.js";
import {
  ApproveBatchRequestSchema,
  AttendanceListResponseSchema,
  AttendanceSummarySchema,
  AttendanceUpsertSchema,
  DisburseBatchRequestSchema,
  EmployeeCreateRequestSchema,
  EmployeePageSchema,
  EmployeeSchema,
  EmployeeUpdateRequestSchema,
  FileDownloadResponseSchema,
  GenerateReportRequestSchema,
  LeaveDecisionRequestSchema,
  LeaveRequestCreateSchema,
  LeaveRequestListResponseSchema,
  LeaveRequestSchema,
  PayrollBatchCreateSchema,
  PayrollBatchPageSchema,
  PayrollBatchSchema,
  PayrollBranchListResponseSchema,
  PayrollPaymentSchema,
  PayslipGenerateResponseSchema,
  PayslipPageSchema,
  PayslipSchema,
  SalesAchievementListResponseSchema,
  SalesAchievementSchema,
  ReversePaymentRequestSchema,
  RetryBatchRequestSchema,
  SalesAchievementUpsertSchema,
  TaxReconciliationListResponseSchema,
  TaxReconciliationRequestSchema,
  TaxReconciliationSchema,
  TaxReportPageSchema,
  TaxReportSchema,
} from "./payroll.js";
import { PaymentWebhookAckSchema, PaymentWebhookRequestSchema } from "./payments.js";
import {
  ClaimsPolicySchema,
  CreatePolicyRequestSchema,
  PayrollPolicySchema,
  PolicyVersionSchema,
} from "./policy.js";

type JsonSchema = Record<string, unknown>;

function toJsonSchema(schema: z.ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as JsonSchema;
  const rest = { ...json };
  delete rest.$schema;
  return rest;
}

function ref(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

function envelopeComponent(name: string, dataSchema: z.ZodType): JsonSchema {
  return toJsonSchema(apiResponseSchema(dataSchema));
}

function failureComponent(): JsonSchema {
  return toJsonSchema(apiFailureSchema);
}

function jsonResponse(name: string, description: string): JsonSchema {
  return {
    description,
    content: {
      "application/json": {
        schema: ref(name),
      },
    },
  };
}

function errorResponses(): JsonSchema {
  return {
    "400": jsonResponse("ApiFailureEnvelope", "Validasi gagal"),
    "401": jsonResponse("ApiFailureEnvelope", "Tidak terautentikasi"),
    "403": jsonResponse("ApiFailureEnvelope", "Tidak berwenang"),
    "404": jsonResponse("ApiFailureEnvelope", "Tidak ditemukan"),
    "409": jsonResponse("ApiFailureEnvelope", "Konflik"),
    "422": jsonResponse("ApiFailureEnvelope", "Melanggar kebijakan"),
    "429": jsonResponse("ApiFailureEnvelope", "Rate limit"),
    "500": jsonResponse("ApiFailureEnvelope", "Kesalahan internal"),
  };
}

function pathParameter(name: string, description: string): JsonSchema {
  return {
    name,
    in: "path",
    required: true,
    description,
    schema: { type: "string", format: "uuid" },
  };
}

function queryParameter(name: string, description: string, type = "string"): JsonSchema {
  return {
    name,
    in: "query",
    required: false,
    description,
    schema: { type },
  };
}

function operation(
  summary: string,
  tag: string,
  responseSchemaName: string,
  requestSchemaName?: string,
  parameters: JsonSchema[] = [],
): JsonSchema {
  return {
    summary,
    tags: [tag],
    parameters,
    ...(requestSchemaName
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref(requestSchemaName),
              },
            },
          },
        }
      : {}),
    responses: {
      "200": jsonResponse(responseSchemaName, "Berhasil"),
      ...errorResponses(),
    },
  };
}

export function buildOpenApiDocument(): JsonSchema {
  const schemas: Record<string, JsonSchema> = {
    ApiFailureEnvelope: failureComponent(),
    ClaimsPolicy: toJsonSchema(ClaimsPolicySchema),
    PayrollPolicy: toJsonSchema(PayrollPolicySchema),
    PolicyVersion: toJsonSchema(PolicyVersionSchema),
    LoginRequest: toJsonSchema(LoginRequestSchema),
    LoginResponseEnvelope: envelopeComponent("LoginResponseEnvelope", LoginResponseSchema),
    CreateClaimRequest: toJsonSchema(CreateClaimRequestSchema),
    UpdateClaimRequest: toJsonSchema(UpdateClaimRequestSchema),
    ComplianceReviewRequest: toJsonSchema(ComplianceReviewRequestSchema),
    ClaimPayment: toJsonSchema(ClaimPaymentSchema),
    ClaimPaymentEnvelope: envelopeComponent("ClaimPaymentEnvelope", ClaimPaymentSchema),
    PaymentWebhookRequest: toJsonSchema(PaymentWebhookRequestSchema),
    PaymentWebhookAckEnvelope: envelopeComponent(
      "PaymentWebhookAckEnvelope",
      PaymentWebhookAckSchema,
    ),
    ClaimSummaryPageEnvelope: envelopeComponent("ClaimSummaryPageEnvelope", ClaimSummaryPageSchema),
    ClaimDetailEnvelope: envelopeComponent("ClaimDetailEnvelope", ClaimDetailSchema),
    DecideClaimRequest: toJsonSchema(DecideClaimRequestSchema),
    DisburseClaimRequest: toJsonSchema(DisburseClaimRequestSchema),
    UploadSignatureRequest: toJsonSchema(UploadSignatureRequestSchema),
    UploadSignatureResponseEnvelope: envelopeComponent(
      "UploadSignatureResponseEnvelope",
      UploadSignatureResponseSchema,
    ),
    PayrollBatchCreate: toJsonSchema(PayrollBatchCreateSchema),
    PayrollBatchEnvelope: envelopeComponent("PayrollBatchEnvelope", PayrollBatchSchema),
    PayrollBatchPageEnvelope: envelopeComponent("PayrollBatchPageEnvelope", PayrollBatchPageSchema),
    PayrollBranchListEnvelope: envelopeComponent(
      "PayrollBranchListEnvelope",
      PayrollBranchListResponseSchema,
    ),
    ApproveBatchRequest: toJsonSchema(ApproveBatchRequestSchema),
    DisburseBatchRequest: toJsonSchema(DisburseBatchRequestSchema),
    GenerateReportRequest: toJsonSchema(GenerateReportRequestSchema),
    TaxReportEnvelope: envelopeComponent("TaxReportEnvelope", TaxReportSchema),
    TaxReportPageEnvelope: envelopeComponent("TaxReportPageEnvelope", TaxReportPageSchema),
    FileDownloadEnvelope: envelopeComponent("FileDownloadEnvelope", FileDownloadResponseSchema),
    ReversePaymentRequest: toJsonSchema(ReversePaymentRequestSchema),
    RetryBatchRequest: toJsonSchema(RetryBatchRequestSchema),
    TaxReconciliation: toJsonSchema(TaxReconciliationSchema),
    TaxReconciliationEnvelope: envelopeComponent(
      "TaxReconciliationEnvelope",
      TaxReconciliationSchema,
    ),
    TaxReconciliationListEnvelope: envelopeComponent(
      "TaxReconciliationListEnvelope",
      TaxReconciliationListResponseSchema,
    ),
    TaxReconciliationRequest: toJsonSchema(TaxReconciliationRequestSchema),
    CreatePolicyRequest: toJsonSchema(CreatePolicyRequestSchema),
    PolicyVersionEnvelope: envelopeComponent("PolicyVersionEnvelope", PolicyVersionSchema),
    EmployeeCreateRequest: toJsonSchema(EmployeeCreateRequestSchema),
    EmployeeSchema: toJsonSchema(EmployeeSchema),
    EmployeeEnvelope: envelopeComponent("EmployeeEnvelope", EmployeeSchema),
    EmployeePageEnvelope: envelopeComponent("EmployeePageEnvelope", EmployeePageSchema),
    EmployeeUpdateRequest: toJsonSchema(EmployeeUpdateRequestSchema),
    AttendanceUpsert: toJsonSchema(AttendanceUpsertSchema),
    AttendanceListEnvelope: envelopeComponent(
      "AttendanceListEnvelope",
      AttendanceListResponseSchema,
    ),
    AttendanceEnvelope: envelopeComponent("AttendanceEnvelope", AttendanceSummarySchema),
    SalesAchievementUpsert: toJsonSchema(SalesAchievementUpsertSchema),
    SalesAchievementListEnvelope: envelopeComponent(
      "SalesAchievementListEnvelope",
      SalesAchievementListResponseSchema,
    ),
    SalesAchievementEnvelope: envelopeComponent("SalesAchievementEnvelope", SalesAchievementSchema),
    LeaveRequestCreate: toJsonSchema(LeaveRequestCreateSchema),
    LeaveDecisionRequest: toJsonSchema(LeaveDecisionRequestSchema),
    LeaveRequestListEnvelope: envelopeComponent(
      "LeaveRequestListEnvelope",
      LeaveRequestListResponseSchema,
    ),
    LeaveRequestEnvelope: envelopeComponent("LeaveRequestEnvelope", LeaveRequestSchema),
    PayslipGenerateResponseEnvelope: envelopeComponent(
      "PayslipGenerateResponseEnvelope",
      PayslipGenerateResponseSchema,
    ),
    PayslipSchema: toJsonSchema(PayslipSchema),
    PayslipEnvelope: envelopeComponent("PayslipEnvelope", PayslipSchema),
    PayrollPaymentEnvelope: envelopeComponent("PayrollPaymentEnvelope", PayrollPaymentSchema),
    PayslipPageEnvelope: envelopeComponent("PayslipPageEnvelope", PayslipPageSchema),
    ClaimSummary: toJsonSchema(ClaimSummarySchema),
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Aletheia API",
      version: "v1",
      description:
        "Kontrak REST Aletheia. Semua nominal memakai string desimal. Semua mutasi finansial memakai Idempotency-Key.",
    },
    servers: [{ url: "http://localhost:8080", description: "Local Docker Compose" }],
    tags: [
      { name: "Auth" },
      { name: "Claims" },
      { name: "Payroll" },
      { name: "Reports" },
      { name: "Policies" },
      { name: "Employees" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas,
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/v1/auth/login": {
        post: {
          ...operation("Login", "Auth", "LoginResponseEnvelope", "LoginRequest"),
          security: [],
        },
      },
      "/api/v1/claims/upload-signature": {
        post: operation(
          "Buat signature upload Cloudinary",
          "Claims",
          "UploadSignatureResponseEnvelope",
          "UploadSignatureRequest",
        ),
      },
      "/api/v1/claims": {
        get: operation("Daftar klaim", "Claims", "ClaimSummaryPageEnvelope", undefined, [
          queryParameter("cursor", "Cursor keyset"),
          queryParameter("limit", "Jumlah item", "integer"),
          queryParameter("branch_id", "ID cabang"),
          queryParameter("status", "Status klaim"),
          queryParameter("claim_category", "Kategori klaim"),
          queryParameter("has_conflict_flag", "Filter konflik", "boolean"),
          queryParameter("from", "Tanggal awal YYYY-MM-DD"),
          queryParameter("to", "Tanggal akhir YYYY-MM-DD"),
        ]),
        post: operation("Buat draf klaim", "Claims", "ClaimDetailEnvelope", "CreateClaimRequest"),
      },
      "/api/v1/claims/{id}": {
        get: operation("Detail klaim", "Claims", "ClaimDetailEnvelope", undefined, [
          pathParameter("id", "ID klaim"),
        ]),
        patch: operation("Revisi klaim", "Claims", "ClaimDetailEnvelope", "UpdateClaimRequest", [
          pathParameter("id", "ID klaim"),
        ]),
      },
      "/api/v1/claims/{id}/submit": {
        post: operation("Submit klaim", "Claims", "ClaimDetailEnvelope", undefined, [
          pathParameter("id", "ID klaim"),
        ]),
      },
      "/api/v1/claims/{id}/decide": {
        post: operation("Putuskan klaim", "Claims", "ClaimDetailEnvelope", "DecideClaimRequest", [
          pathParameter("id", "ID klaim"),
        ]),
      },
      "/api/v1/claims/{id}/compliance-review": {
        post: operation(
          "Review kepatuhan klaim",
          "Claims",
          "ClaimDetailEnvelope",
          "ComplianceReviewRequest",
          [pathParameter("id", "ID klaim")],
        ),
      },
      "/api/v1/claims/{id}/disburse": {
        post: operation("Cairkan klaim", "Claims", "ClaimPaymentEnvelope", "DisburseClaimRequest", [
          pathParameter("id", "ID klaim"),
        ]),
      },
      "/api/v1/claims/payments/{id}": {
        get: operation("Status payment klaim", "Claims", "ClaimPaymentEnvelope", undefined, [
          pathParameter("id", "ID payment"),
        ]),
      },
      "/api/v1/claims/payments/webhook/{provider}": {
        post: {
          ...operation(
            "Webhook payment klaim",
            "Claims",
            "PaymentWebhookAckEnvelope",
            "PaymentWebhookRequest",
            [pathParameter("provider", "Provider payment")],
          ),
          security: [],
        },
      },
      "/api/v1/payroll/branches": {
        get: operation("Daftar cabang payroll", "Payroll", "PayrollBranchListEnvelope"),
      },
      "/api/v1/payroll/batches": {
        get: operation("Daftar batch payroll", "Payroll", "PayrollBatchPageEnvelope", undefined, [
          queryParameter("cursor", "Cursor keyset"),
          queryParameter("limit", "Jumlah item", "integer"),
          queryParameter("branch_id", "ID cabang"),
          queryParameter("period_month", "Periode YYYY-MM-01"),
        ]),
        post: operation(
          "Buat batch payroll",
          "Payroll",
          "PayrollBatchEnvelope",
          "PayrollBatchCreate",
        ),
      },
      "/api/v1/payroll/batches/{id}/approve": {
        post: operation(
          "Setujui batch payroll",
          "Payroll",
          "PayrollBatchEnvelope",
          "ApproveBatchRequest",
          [pathParameter("id", "ID batch")],
        ),
      },
      "/api/v1/payroll/batches/{id}/disburse": {
        post: operation(
          "Cairkan batch payroll",
          "Payroll",
          "PayrollBatchEnvelope",
          "DisburseBatchRequest",
          [pathParameter("id", "ID batch")],
        ),
      },
      "/api/v1/reports": {
        get: operation("Daftar laporan", "Reports", "TaxReportPageEnvelope", undefined, [
          queryParameter("cursor", "Cursor keyset"),
          queryParameter("limit", "Jumlah item", "integer"),
          queryParameter("report_type", "Tipe laporan"),
          queryParameter("period_month", "Periode YYYY-MM-01"),
        ]),
        post: operation("Buat laporan", "Reports", "TaxReportEnvelope", "GenerateReportRequest"),
      },
      "/api/v1/payroll/batches/{id}/calculate": {
        post: operation("Minta kalkulasi batch", "Payroll", "PayrollBatchEnvelope", undefined, [
          pathParameter("id", "ID batch"),
        ]),
      },
      "/api/v1/payroll/batches/{id}/payslips": {
        post: operation(
          "Minta pembuatan payslip batch",
          "Payroll",
          "PayslipGenerateResponseEnvelope",
          undefined,
          [pathParameter("id", "ID batch")],
        ),
      },
      "/api/v1/payroll/payments/{id}": {
        get: operation("Status payment payroll", "Payroll", "PayrollPaymentEnvelope", undefined, [
          pathParameter("id", "ID payment"),
        ]),
      },
      "/api/v1/payroll/payments/{id}/reverse": {
        post: operation(
          "Balik payment payroll",
          "Payroll",
          "PayrollPaymentEnvelope",
          "ReversePaymentRequest",
          [pathParameter("id", "ID payment")],
        ),
      },
      "/api/v1/payroll/payments/webhook/{provider}": {
        post: {
          ...operation(
            "Webhook payment payroll",
            "Payroll",
            "PaymentWebhookAckEnvelope",
            "PaymentWebhookRequest",
            [pathParameter("provider", "Provider payment")],
          ),
          security: [],
        },
      },
      "/api/v1/payroll/batches/{id}/retry": {
        post: operation(
          "Coba ulang batch gagal",
          "Payroll",
          "PayrollBatchEnvelope",
          "RetryBatchRequest",
          [pathParameter("id", "ID batch")],
        ),
      },
      "/api/v1/payroll/reconciliations": {
        get: operation("Daftar rekonsiliasi tahunan", "Payroll", "TaxReconciliationListEnvelope"),
        post: operation(
          "Buat rekonsiliasi tahunan",
          "Payroll",
          "TaxReconciliationListEnvelope",
          "TaxReconciliationRequest",
        ),
      },
      "/api/v1/payroll/reconciliations/{id}/post": {
        post: operation(
          "Posting rekonsiliasi tahunan",
          "Payroll",
          "TaxReconciliationEnvelope",
          undefined,
          [pathParameter("id", "ID rekonsiliasi")],
        ),
      },
      "/api/v1/payslips/{id}/download": {
        get: operation(
          "Unduh payslip bertanda tangan",
          "Payroll",
          "FileDownloadEnvelope",
          undefined,
          [pathParameter("id", "ID payslip")],
        ),
      },
      "/api/v1/reports/{id}/download": {
        get: operation(
          "Unduh laporan bertanda tangan",
          "Payroll",
          "FileDownloadEnvelope",
          undefined,
          [pathParameter("id", "ID laporan")],
        ),
      },
      "/api/v1/employees/{id}": {
        get: operation("Detail karyawan atau agen", "Employees", "EmployeeEnvelope", undefined, [
          pathParameter("id", "ID personel"),
        ]),
        patch: operation(
          "Ubah data karyawan atau agen",
          "Employees",
          "EmployeeEnvelope",
          "EmployeeUpdateRequest",
          [pathParameter("id", "ID personel")],
        ),
      },
      "/api/v1/attendance": {
        get: operation("Daftar ringkasan absensi", "Payroll", "AttendanceListEnvelope", undefined, [
          queryParameter("period", "Periode YYYY-MM"),
          queryParameter("personnel_id", "ID personel"),
          queryParameter("branch_id", "ID cabang"),
        ]),
      },
      "/api/v1/attendance/{personnelId}/{period}": {
        put: operation(
          "Upsert ringkasan absensi",
          "Payroll",
          "AttendanceEnvelope",
          "AttendanceUpsert",
          [pathParameter("personnelId", "ID personel"), pathParameter("period", "Periode YYYY-MM")],
        ),
      },
      "/api/v1/sales-achievements": {
        get: operation(
          "Daftar capaian penjualan",
          "Payroll",
          "SalesAchievementListEnvelope",
          undefined,
          [
            queryParameter("period", "Periode YYYY-MM"),
            queryParameter("personnel_id", "ID personel"),
            queryParameter("branch_id", "ID cabang"),
          ],
        ),
      },
      "/api/v1/sales-achievements/{personnelId}/{period}": {
        put: operation(
          "Upsert capaian penjualan",
          "Payroll",
          "SalesAchievementEnvelope",
          "SalesAchievementUpsert",
          [pathParameter("personnelId", "ID personel"), pathParameter("period", "Periode YYYY-MM")],
        ),
      },
      "/api/v1/leave-requests": {
        get: operation("Daftar pengajuan cuti", "Payroll", "LeaveRequestListEnvelope", undefined, [
          queryParameter("status", "Status cuti"),
          queryParameter("personnel_id", "ID personel"),
          queryParameter("branch_id", "ID cabang"),
        ]),
        post: operation(
          "Buat pengajuan cuti",
          "Payroll",
          "LeaveRequestEnvelope",
          "LeaveRequestCreate",
        ),
      },
      "/api/v1/leave-requests/{id}/decide": {
        post: operation(
          "Putuskan pengajuan cuti",
          "Payroll",
          "LeaveRequestEnvelope",
          "LeaveDecisionRequest",
          [pathParameter("id", "ID cuti")],
        ),
      },
      "/api/v1/payslips/{id}": {
        get: operation("Detail payslip", "Payroll", "PayslipEnvelope", undefined, [
          pathParameter("id", "ID payslip"),
        ]),
      },
      "/api/v1/reports/{id}": {
        get: operation("Detail laporan", "Reports", "TaxReportEnvelope", undefined, [
          pathParameter("id", "ID laporan"),
        ]),
      },
      "/api/v1/policies": {
        get: operation("Daftar versi kebijakan", "Policies", "PolicyVersionEnvelope", undefined, [
          queryParameter("cursor", "Cursor keyset"),
          queryParameter("limit", "Jumlah item", "integer"),
          queryParameter("domain", "Domain kebijakan"),
          queryParameter("status", "Status kebijakan"),
        ]),
        post: operation(
          "Buat draf kebijakan",
          "Policies",
          "PolicyVersionEnvelope",
          "CreatePolicyRequest",
        ),
      },
      "/api/v1/employees": {
        get: operation("Daftar karyawan dan agen", "Employees", "EmployeePageEnvelope", undefined, [
          queryParameter("cursor", "Cursor keyset"),
          queryParameter("limit", "Jumlah item", "integer"),
          queryParameter("branch_id", "ID cabang"),
          queryParameter("personnel_type", "Tipe personel"),
          queryParameter("status", "Status kerja"),
        ]),
        post: operation(
          "Daftarkan karyawan atau agen",
          "Employees",
          "EmployeeEnvelope",
          "EmployeeCreateRequest",
        ),
      },
      "/api/v1/payslips": {
        get: operation("Daftar payslip", "Payroll", "PayslipPageEnvelope", undefined, [
          queryParameter("cursor", "Cursor keyset"),
          queryParameter("limit", "Jumlah item", "integer"),
          queryParameter("period_month", "Periode YYYY-MM-01"),
          queryParameter("personnel_id", "ID personel"),
        ]),
      },
    },
  };
}
