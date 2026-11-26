import { z } from "zod";

import { ApiMetaSchema } from "./api.js";
import {
  ClaimCategorySchema,
  ClaimDecisionSchema,
  ClaimStatusSchema,
  DocumentTypeSchema,
  PaymentProviderNameSchema,
  PaymentStatusSchema,
  RoleSchema,
} from "./enums.js";
import {
  BooleanQuerySchema,
  BankAccountSchema,
  CursorSchema,
  DateOnlySchema,
  IsoDateTimeSchema,
  MaskedAccountSchema,
  MaskedNikSchema,
  MoneySchema,
  NikSchema,
  NotesSchema,
  PaginationQuerySchema,
  UuidSchema,
} from "./primitives.js";

export const ClaimDocumentInputSchema = z
  .object({
    document_type: DocumentTypeSchema,
    cloudinary_public_id: z.string().min(1).max(255),
    secure_url: z.string().url(),
    mime_type: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
    file_size_bytes: z
      .number()
      .int()
      .min(1)
      .max(5 * 1024 * 1024),
  })
  .strict();
export type ClaimDocumentInput = z.infer<typeof ClaimDocumentInputSchema>;

export const CreateClaimRequestSchema = z
  .object({
    claimant_name: z.string().trim().min(2).max(120),
    claimant_nik: NikSchema,
    claimant_bank_account: BankAccountSchema,
    claim_category: ClaimCategorySchema,
    requested_amount: MoneySchema,
    documents: z.array(ClaimDocumentInputSchema).max(20).optional(),
  })
  .strict();
export type CreateClaimRequest = z.infer<typeof CreateClaimRequestSchema>;

export const UpdateClaimRequestSchema = z
  .object({
    claimant_name: z.string().trim().min(2).max(120).optional(),
    claimant_nik: NikSchema.optional(),
    claimant_bank_account: BankAccountSchema.optional(),
    claim_category: ClaimCategorySchema.optional(),
    requested_amount: MoneySchema.optional(),
    documents: z.array(ClaimDocumentInputSchema).max(20).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Minimal satu field harus diubah",
  });
export type UpdateClaimRequest = z.infer<typeof UpdateClaimRequestSchema>;

export const SubmitClaimRequestSchema = z.object({}).strict();
export type SubmitClaimRequest = z.infer<typeof SubmitClaimRequestSchema>;

export const DecideClaimRequestSchema = z
  .object({
    decision: ClaimDecisionSchema,
    approved_amount: MoneySchema.optional(),
    reason_notes: NotesSchema.optional(),
  })
  .strict()
  .refine((value) => value.decision !== "APPROVED" || value.approved_amount !== undefined, {
    message: "approved_amount wajib diisi untuk keputusan APPROVED",
    path: ["approved_amount"],
  })
  .refine((value) => value.decision === "APPROVED" || value.reason_notes !== undefined, {
    message: "reason_notes wajib diisi untuk REJECTED atau RETURNED",
    path: ["reason_notes"],
  });
export type DecideClaimRequest = z.infer<typeof DecideClaimRequestSchema>;

export const UploadSignatureRequestSchema = z
  .object({
    document_type: DocumentTypeSchema,
    file_name: z.string().min(1).max(180),
    mime_type: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
    file_size_bytes: z
      .number()
      .int()
      .min(1)
      .max(5 * 1024 * 1024),
  })
  .strict();
export type UploadSignatureRequest = z.infer<typeof UploadSignatureRequestSchema>;

export const UploadSignatureResponseSchema = z
  .object({
    cloud_name: z.string().min(1),
    api_key: z.string().min(1),
    folder: z.string().min(1),
    timestamp: z.number().int().positive(),
    signature: z.string().min(1),
    allowed_formats: z.array(z.string().min(1)).min(1),
    max_file_size: z.number().int().positive(),
  })
  .strict();
export type UploadSignatureResponse = z.infer<typeof UploadSignatureResponseSchema>;

export const ClaimDocumentSchema = z
  .object({
    id: UuidSchema,
    document_type: DocumentTypeSchema,
    secure_url: z.string().url(),
    mime_type: z.string().min(1),
    file_size_bytes: z.number().int().positive(),
    uploaded_at: IsoDateTimeSchema,
  })
  .strict();
export type ClaimDocument = z.infer<typeof ClaimDocumentSchema>;

export const ClaimSummarySchema = z
  .object({
    id: UuidSchema,
    claim_number: z.string().min(8).max(32),
    branch_id: UuidSchema,
    claimant_name: z.string().min(2).max(120),
    claimant_nik_masked: MaskedNikSchema,
    bank_account_masked: MaskedAccountSchema,
    claim_category: ClaimCategorySchema,
    requested_amount: MoneySchema,
    approved_amount: MoneySchema.nullable(),
    risk_score: z.number().int().min(0).max(100),
    risk_evaluated_at: IsoDateTimeSchema.nullable(),
    has_conflict_flag: z.boolean(),
    status: ClaimStatusSchema,
    policy_version_id: UuidSchema,
    policy_version_tag: z.string().min(3).max(32),
    created_by: UuidSchema,
    submitted_at: IsoDateTimeSchema.nullable(),
    finalized_at: IsoDateTimeSchema.nullable(),
    created_at: IsoDateTimeSchema,
  })
  .strict();
export type ClaimSummary = z.infer<typeof ClaimSummarySchema>;

export const AnomalySeveritySchema = z.enum(["HIGH", "CRITICAL"]);
export const AnomalyConflictTypeSchema = z.enum([
  "SHARED_BANK_ACCOUNT",
  "SHARED_NIK_IDENTITY",
  "MULTI_CLAIM_SAME_ACCOUNT",
]);
export const AnomalyResolutionSchema = z.enum(["OPEN", "CONFIRMED_FRAUD", "FALSE_POSITIVE"]);

export const ComplianceReviewRequestSchema = z
  .object({
    resolution: z.enum(["CONFIRMED_FRAUD", "FALSE_POSITIVE"]),
    reason_notes: NotesSchema,
  })
  .strict();
export type ComplianceReviewRequest = z.infer<typeof ComplianceReviewRequestSchema>;

export const AnomalyFlagSchema = z
  .object({
    id: UuidSchema,
    conflict_type: AnomalyConflictTypeSchema,
    severity: AnomalySeveritySchema,
    matched_personnel_code: z.string().nullable(),
    matched_personnel_name: z.string().nullable(),
    matched_personnel_type: z.string().nullable(),
    matched_claim_number: z.string().nullable(),
    evidence_summary: z.record(z.string(), z.unknown()),
    resolution_status: AnomalyResolutionSchema,
    detected_at: IsoDateTimeSchema,
  })
  .strict();
export type AnomalyFlag = z.infer<typeof AnomalyFlagSchema>;

export const AuditEntrySchema = z
  .object({
    id: z.string().min(1),
    actor_name: z.string().min(1),
    actor_role: RoleSchema,
    action: z.string().min(1),
    policy_version_tag: z.string().min(3).max(32).nullable(),
    decision_context: z.record(z.string(), z.unknown()),
    record_hash: z.string().regex(/^[a-f0-9]{64}$/),
    recorded_at: IsoDateTimeSchema,
  })
  .strict();
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const ClaimDetailSchema = ClaimSummarySchema.extend({
  documents: z.array(ClaimDocumentSchema),
  anomaly_flags: z.array(AnomalyFlagSchema),
  audit_history: z.array(AuditEntrySchema),
  bound_policy_rules: z.record(z.string(), z.unknown()),
  compliance_reviewed_by: UuidSchema.nullable(),
  compliance_reviewed_at: IsoDateTimeSchema.nullable(),
}).strict();
export type ClaimDetail = z.infer<typeof ClaimDetailSchema>;

export const ClaimListQuerySchema = PaginationQuerySchema.extend({
  branch_id: UuidSchema.optional(),
  status: ClaimStatusSchema.optional(),
  claim_category: ClaimCategorySchema.optional(),
  has_conflict_flag: BooleanQuerySchema.optional(),
  from: DateOnlySchema.optional(),
  to: DateOnlySchema.optional(),
}).strict();
export type ClaimListQuery = z.infer<typeof ClaimListQuerySchema>;

export const CursorPageMetaSchema = ApiMetaSchema;
export const ClaimSummaryPageSchema = z
  .object({
    items: z.array(ClaimSummarySchema),
    meta: ApiMetaSchema,
  })
  .strict();
export type ClaimSummaryPage = z.infer<typeof ClaimSummaryPageSchema>;

export const DisburseClaimRequestSchema = z
  .object({
    provider: PaymentProviderNameSchema,
  })
  .strict();
export type DisburseClaimRequest = z.infer<typeof DisburseClaimRequestSchema>;

export const ClaimPaymentSchema = z
  .object({
    id: UuidSchema,
    claim_id: UuidSchema,
    provider: PaymentProviderNameSchema,
    provider_reference: z.string().nullable(),
    amount: MoneySchema,
    status: PaymentStatusSchema,
    idempotency_key: z.string().min(8).max(128),
    requested_by: UuidSchema,
    approved_by: UuidSchema,
    requested_at: IsoDateTimeSchema,
    paid_at: IsoDateTimeSchema.nullable(),
    failure_reason: z.string().nullable(),
  })
  .strict();
export type ClaimPayment = z.infer<typeof ClaimPaymentSchema>;

export const ClaimPaymentListQuerySchema = PaginationQuerySchema.extend({
  status: PaymentStatusSchema.optional(),
}).strict();
export type ClaimPaymentListQuery = z.infer<typeof ClaimPaymentListQuerySchema>;

export const ClaimIdParamSchema = z.object({ id: UuidSchema }).strict();
export const ClaimCursorSchema = z.object({ cursor: CursorSchema.optional() }).strict();
