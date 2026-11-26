import {
  LeaveDecisionRequestSchema,
  LeaveRequestListResponseSchema,
  LeaveRequestSchema,
  OvertimeDecisionRequestSchema,
  OvertimeRequestListResponseSchema,
  OvertimeRequestSchema,
  ReimbursementDecisionRequestSchema,
  ReimbursementPageSchema,
  ReimbursementSchema,
  type LeaveRequest,
  type OvertimeRequest,
  type Reimbursement,
  type ReimbursementPage,
} from "@aletheia/shared-contracts";

import { apiRequest, toQuery, type ApiResult } from "../../shared/api/client";

export interface WorkforceFilters {
  status?: string | undefined;
  branch_id?: string | undefined;
  personnel_id?: string | undefined;
}

export function listWorkforceLeave(
  filters: WorkforceFilters = {},
): Promise<ApiResult<{ items: LeaveRequest[] }>> {
  return apiRequest(
    `/api/v1/leave-requests${toQuery({
      status: filters.status,
      branch_id: filters.branch_id,
      personnel_id: filters.personnel_id,
    })}`,
    { schema: LeaveRequestListResponseSchema },
  );
}

export function decideLeave(
  id: string,
  decision: "APPROVED" | "REJECTED",
  notes?: string,
): Promise<ApiResult<LeaveRequest>> {
  const parsed = LeaveDecisionRequestSchema.parse({
    decision,
    ...(notes === undefined || notes.trim().length === 0 ? {} : { notes: notes.trim() }),
  });
  return apiRequest(`/api/v1/leave-requests/${id}/decide`, {
    method: "POST",
    body: parsed,
    schema: LeaveRequestSchema,
  });
}

export function listWorkforceOvertime(
  filters: WorkforceFilters = {},
): Promise<ApiResult<{ items: OvertimeRequest[] }>> {
  return apiRequest(
    `/api/v1/overtime-requests${toQuery({
      status: filters.status,
      branch_id: filters.branch_id,
      personnel_id: filters.personnel_id,
    })}`,
    { schema: OvertimeRequestListResponseSchema },
  );
}

export function decideOvertime(
  id: string,
  decision: "APPROVED" | "REJECTED",
  notes?: string,
): Promise<ApiResult<OvertimeRequest>> {
  const parsed = OvertimeDecisionRequestSchema.parse({
    decision,
    ...(notes === undefined || notes.trim().length === 0 ? {} : { notes: notes.trim() }),
  });
  return apiRequest(`/api/v1/overtime-requests/${id}/decide`, {
    method: "POST",
    body: parsed,
    schema: OvertimeRequestSchema,
  });
}

export function listWorkforceReimbursements(
  filters: WorkforceFilters = {},
): Promise<ApiResult<ReimbursementPage>> {
  return apiRequest(
    `/api/v1/reimbursements${toQuery({
      status: filters.status,
      branch_id: filters.branch_id,
      personnel_id: filters.personnel_id,
      limit: 100,
    })}`,
    { schema: ReimbursementPageSchema },
  );
}

export function decideReimbursement(
  id: string,
  decision: "APPROVED" | "REJECTED",
  notes?: string,
): Promise<ApiResult<Reimbursement>> {
  const parsed = ReimbursementDecisionRequestSchema.parse({
    decision,
    ...(notes === undefined || notes.trim().length === 0 ? {} : { notes: notes.trim() }),
  });
  return apiRequest(`/api/v1/reimbursements/${id}/decide`, {
    method: "POST",
    body: parsed,
    schema: ReimbursementSchema,
  });
}

export function payReimbursement(id: string): Promise<ApiResult<Reimbursement>> {
  return apiRequest(`/api/v1/reimbursements/${id}/pay`, {
    method: "POST",
    body: {},
    schema: ReimbursementSchema,
  });
}
