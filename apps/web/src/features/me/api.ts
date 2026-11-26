import {
  AttendanceListResponseSchema,
  FileDownloadResponseSchema,
  LeaveBalanceListResponseSchema,
  LeaveRequestListResponseSchema,
  LeaveRequestSchema,
  MeProfileSchema,
  OvertimeRequestCreateSchema,
  OvertimeRequestListResponseSchema,
  OvertimeRequestSchema,
  PayslipPageSchema,
  SelfLeaveRequestCreateSchema,
  type FileDownloadResponse,
  type LeaveBalance,
  type LeaveRequest,
  type MeProfile,
  type OvertimeRequest,
  type OvertimeRequestCreate,
  type PayslipPage,
  type SelfLeaveRequestCreate,
  type AttendanceSummary,
} from "@aletheia/shared-contracts";

import { apiRequest, toQuery, type ApiResult } from "../../shared/api/client";

export function getMyProfile(): Promise<ApiResult<MeProfile>> {
  return apiRequest("/api/v1/me/profile", { schema: MeProfileSchema });
}

export interface MyPayslipFilters {
  period_month?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export function listMyPayslips(filters: MyPayslipFilters = {}): Promise<ApiResult<PayslipPage>> {
  return apiRequest(
    `/api/v1/me/payslips${toQuery({
      period_month: filters.period_month,
      cursor: filters.cursor,
      limit: filters.limit ?? 25,
    })}`,
    { schema: PayslipPageSchema },
  );
}

export function downloadMyPayslip(id: string): Promise<ApiResult<FileDownloadResponse>> {
  return apiRequest(`/api/v1/me/payslips/${id}/download`, {
    schema: FileDownloadResponseSchema,
  });
}

export function listMyAttendance(input: {
  period?: string | undefined;
}): Promise<ApiResult<{ items: AttendanceSummary[] }>> {
  return apiRequest(`/api/v1/me/attendance${toQuery({ period: input.period })}`, {
    schema: AttendanceListResponseSchema,
  });
}

export function listMyLeaveBalances(year?: number): Promise<ApiResult<{ items: LeaveBalance[] }>> {
  return apiRequest(`/api/v1/me/leave-balances${toQuery({ year })}`, {
    schema: LeaveBalanceListResponseSchema,
  });
}

export function listMyLeaveRequests(): Promise<ApiResult<{ items: LeaveRequest[] }>> {
  return apiRequest("/api/v1/me/leave-requests", {
    schema: LeaveRequestListResponseSchema,
  });
}

export function createMyLeaveRequest(
  input: SelfLeaveRequestCreate,
): Promise<ApiResult<LeaveRequest>> {
  const parsed = SelfLeaveRequestCreateSchema.parse(input);
  return apiRequest("/api/v1/me/leave-requests", {
    method: "POST",
    body: parsed,
    schema: LeaveRequestSchema,
  });
}

export function listMyOvertimeRequests(): Promise<ApiResult<{ items: OvertimeRequest[] }>> {
  return apiRequest("/api/v1/me/overtime-requests", {
    schema: OvertimeRequestListResponseSchema,
  });
}

export function createMyOvertimeRequest(
  input: OvertimeRequestCreate,
): Promise<ApiResult<OvertimeRequest>> {
  const parsed = OvertimeRequestCreateSchema.parse(input);
  return apiRequest("/api/v1/me/overtime-requests", {
    method: "POST",
    body: parsed,
    schema: OvertimeRequestSchema,
  });
}
