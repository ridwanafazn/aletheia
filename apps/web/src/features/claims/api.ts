import {
  ClaimDetailSchema,
  ClaimPaymentSchema,
  ClaimSummaryPageSchema,
  UploadSignatureResponseSchema,
  type ClaimDetail,
  type ClaimPayment,
  type ClaimSummaryPage,
  type CreateClaimRequest,
  type DecideClaimRequest,
  type DisburseClaimRequest,
  type UpdateClaimRequest,
  type UploadSignatureRequest,
  type UploadSignatureResponse,
} from "@aletheia/shared-contracts";

import { ApiError, apiRequest, toQuery } from "../../shared/api/client";

export interface ClaimFilters {
  status?: string | undefined;
  claim_category?: string | undefined;
  has_conflict_flag?: string | undefined;
  branch_id?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface ActiveClaimsPolicy {
  id: string;
  version_tag: string;
  rules_payload: {
    approval_tiers: {
      level_1_branch_manager_max: string;
      level_2_finance_manager_max: string;
      auto_escalate_risk_threshold: number;
    };
    required_documents_by_category: Record<string, string[]>;
    optional_documents_by_category: Record<string, string[]>;
    sla_target_hours: number;
  };
}

export function getActiveClaimsPolicy(): Promise<{ data: ActiveClaimsPolicy }> {
  return apiRequest("/api/v1/policies/active/CLAIMS_POLICY");
}

export function listClaims(filters: ClaimFilters) {
  return apiRequest(
    `/api/v1/claims${toQuery({
      status: filters.status,
      claim_category: filters.claim_category,
      has_conflict_flag: filters.has_conflict_flag,
      branch_id: filters.branch_id,
      from: filters.from,
      to: filters.to,
      cursor: filters.cursor,
      limit: filters.limit ?? 25,
    })}`,
    { schema: ClaimSummaryPageSchema },
  );
}

export function getClaim(claimId: string) {
  return apiRequest(`/api/v1/claims/${claimId}`, {
    schema: ClaimDetailSchema,
  });
}

export function createClaim(
  input: CreateClaimRequest,
  idempotencyKey: string,
): Promise<{ data: ClaimDetail }> {
  return apiRequest("/api/v1/claims", {
    method: "POST",
    body: input,
    idempotencyKey,
    schema: ClaimDetailSchema,
  });
}

export function updateClaim(
  claimId: string,
  input: UpdateClaimRequest,
): Promise<{ data: ClaimDetail }> {
  return apiRequest(`/api/v1/claims/${claimId}`, {
    method: "PATCH",
    body: input,
    schema: ClaimDetailSchema,
  });
}

export function submitClaim(claimId: string): Promise<{ data: ClaimDetail }> {
  return apiRequest(`/api/v1/claims/${claimId}/submit`, {
    method: "POST",
    body: {},
    schema: ClaimDetailSchema,
  });
}

export function decideClaim(
  claimId: string,
  input: DecideClaimRequest,
  idempotencyKey: string,
): Promise<{ data: ClaimDetail }> {
  return apiRequest(`/api/v1/claims/${claimId}/decide`, {
    method: "POST",
    body: input,
    idempotencyKey,
    schema: ClaimDetailSchema,
  });
}

export function reviewClaimCompliance(
  claimId: string,
  input: { resolution: "CONFIRMED_FRAUD" | "FALSE_POSITIVE"; reason_notes: string },
): Promise<{ data: ClaimDetail }> {
  return apiRequest(`/api/v1/claims/${claimId}/compliance-review`, {
    method: "POST",
    body: input,
    schema: ClaimDetailSchema,
  });
}

export function disburseClaim(
  claimId: string,
  input: DisburseClaimRequest,
  idempotencyKey: string,
): Promise<{ data: ClaimPayment }> {
  return apiRequest(`/api/v1/claims/${claimId}/disburse`, {
    method: "POST",
    body: input,
    idempotencyKey,
    schema: ClaimPaymentSchema,
  });
}

export function getClaimPayment(paymentId: string): Promise<{ data: ClaimPayment }> {
  return apiRequest(`/api/v1/claims/payments/${paymentId}`, {
    schema: ClaimPaymentSchema,
  });
}

export function requestUploadSignature(
  input: UploadSignatureRequest,
): Promise<{ data: UploadSignatureResponse }> {
  return apiRequest("/api/v1/claims/upload-signature", {
    method: "POST",
    body: input,
    schema: UploadSignatureResponseSchema,
  });
}

export interface UploadedDocument {
  document_type: UploadSignatureRequest["document_type"];
  cloudinary_public_id: string;
  secure_url: string;
  mime_type: UploadSignatureRequest["mime_type"];
  file_size_bytes: number;
}

const DEMO_UPLOAD = import.meta.env.DEV || import.meta.env.VITE_DEMO_UPLOAD === "true";

export async function uploadDocument(
  file: File,
  documentType: UploadSignatureRequest["document_type"],
): Promise<UploadedDocument> {
  if (file.size > 5 * 1024 * 1024) {
    throw new ApiError({
      status: 422,
      code: "ERR_POLICY_RULE_VIOLATION",
      message: "Ukuran dokumen melebihi 5 MB",
    });
  }

  const signature = await requestUploadSignature({
    document_type: documentType,
    file_name: file.name,
    mime_type: file.type as UploadSignatureRequest["mime_type"],
    file_size_bytes: file.size,
  });

  if (DEMO_UPLOAD) {
    const publicId = `demo/${documentType.toLowerCase()}-${crypto.randomUUID()}`;
    return {
      document_type: documentType,
      cloudinary_public_id: publicId,
      secure_url: `https://res.cloudinary.com/${signature.data.cloud_name}/image/upload/${publicId}`,
      mime_type: file.type as UploadSignatureRequest["mime_type"],
      file_size_bytes: file.size,
    };
  }

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signature.data.api_key);
  form.append("timestamp", String(signature.data.timestamp));
  form.append("signature", signature.data.signature);
  form.append("folder", signature.data.folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.data.cloud_name}/auto/upload`,
    { method: "POST", body: form },
  );
  if (!response.ok) {
    throw new ApiError({
      status: 502,
      code: "ERR_INTERNAL_ERROR",
      message: "Unggahan dokumen ke Cloudinary gagal",
    });
  }
  const uploaded = (await response.json()) as { secure_url?: string; public_id?: string };
  if (uploaded.secure_url === undefined || uploaded.public_id === undefined) {
    throw new ApiError({
      status: 502,
      code: "ERR_INTERNAL_ERROR",
      message: "Cloudinary tidak mengembalikan URL dokumen",
    });
  }

  return {
    document_type: documentType,
    cloudinary_public_id: uploaded.public_id,
    secure_url: uploaded.secure_url,
    mime_type: file.type as UploadSignatureRequest["mime_type"],
    file_size_bytes: file.size,
  };
}

export interface AuditLogRow {
  id: string;
  tenant_id: string;
  event_uuid: string;
  correlation_id: string;
  actor_id: string;
  actor_name: string | null;
  actor_role: string;
  domain: string;
  entity_type: string;
  entity_id: string;
  action: string;
  policy_version_id: string | null;
  decision_context: Record<string, unknown>;
  prev_record_hash: string;
  record_hash: string;
  recorded_at: string;
}

export function listAuditLogs(filters: {
  domain?: string | undefined;
  entity_id?: string | undefined;
  actor_id?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}) {
  return apiRequest<AuditLogRow[]>(
    `/api/v1/audit-logs${toQuery({
      domain: filters.domain,
      entity_id: filters.entity_id,
      actor_id: filters.actor_id,
      from: filters.from,
      to: filters.to,
      cursor: filters.cursor,
      limit: filters.limit ?? 25,
    })}`,
  );
}

export function verifyAuditChain() {
  return apiRequest<{ valid: boolean; checked: number; broken_at: string | null }>(
    "/api/v1/audit-logs/verify",
  );
}

export type { ClaimDetail, ClaimPayment, ClaimSummaryPage };
