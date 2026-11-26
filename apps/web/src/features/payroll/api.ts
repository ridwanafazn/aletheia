import {
  PayrollBatchDetailSchema,
  PayrollBatchPageSchema,
  PayrollBatchSchema,
  type PayrollBatch,
  type PayrollBatchCreate,
  type PayrollBatchDetail,
  type PayrollBatchPage,
  type PaymentProviderName,
} from "@aletheia/shared-contracts";

import { apiRequest, toQuery, type ApiResult } from "../../shared/api/client";

export interface PayrollBatchFilters {
  branch_id?: string | undefined;
  period_month?: string | undefined;
  status?: string | undefined;
  batch_type?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export function listPayrollBatches(
  filters: PayrollBatchFilters = {},
): Promise<ApiResult<PayrollBatchPage>> {
  return apiRequest(
    `/api/v1/payroll/batches${toQuery({
      branch_id: filters.branch_id,
      period_month: filters.period_month,
      status: filters.status,
      batch_type: filters.batch_type,
      cursor: filters.cursor,
      limit: filters.limit ?? 25,
    })}`,
    { schema: PayrollBatchPageSchema },
  );
}

export function getPayrollBatch(batchId: string): Promise<ApiResult<PayrollBatchDetail>> {
  return apiRequest(`/api/v1/payroll/batches/${batchId}`, {
    schema: PayrollBatchDetailSchema,
  });
}

export function createPayrollBatch(
  input: PayrollBatchCreate,
  idempotencyKey: string,
): Promise<ApiResult<PayrollBatchDetail>> {
  return apiRequest("/api/v1/payroll/batches", {
    method: "POST",
    body: input,
    idempotencyKey,
    schema: PayrollBatchDetailSchema,
  });
}

export function calculatePayrollBatch(batchId: string): Promise<ApiResult<PayrollBatch>> {
  return apiRequest(`/api/v1/payroll/batches/${batchId}/calculate`, {
    method: "POST",
    body: {},
    schema: PayrollBatchSchema,
  });
}

export function approvePayrollBatch(
  batchId: string,
  notes: string | undefined,
  idempotencyKey: string,
): Promise<ApiResult<PayrollBatchDetail>> {
  return apiRequest(`/api/v1/payroll/batches/${batchId}/approve`, {
    method: "POST",
    body: notes === undefined || notes.trim().length === 0 ? {} : { notes: notes.trim() },
    idempotencyKey,
    schema: PayrollBatchDetailSchema,
  });
}

export function disbursePayrollBatch(
  batchId: string,
  provider: PaymentProviderName,
  idempotencyKey: string,
): Promise<ApiResult<PayrollBatchDetail>> {
  return apiRequest(`/api/v1/payroll/batches/${batchId}/disburse`, {
    method: "POST",
    body: { provider },
    idempotencyKey,
    schema: PayrollBatchDetailSchema,
  });
}
