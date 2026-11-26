import {
  FileDownloadResponseSchema,
  PayslipGenerateResponseSchema,
  PayslipPageSchema,
  PayslipSchema,
  TaxReportPageSchema,
  TaxReportSchema,
  type FileDownloadResponse,
  type GenerateReportRequest,
  type Payslip,
  type PayslipGenerateResponse,
  type PayslipPage,
  type ReportType,
  type TaxReport,
  type TaxReportPage,
} from "@aletheia/shared-contracts";

import { apiRequest, toQuery, type ApiResult } from "../../shared/api/client";

export interface PayslipFilters {
  period_month?: string | undefined;
  personnel_id?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export function listPayslips(filters: PayslipFilters = {}): Promise<ApiResult<PayslipPage>> {
  return apiRequest(
    `/api/v1/payslips${toQuery({
      period_month: filters.period_month,
      personnel_id: filters.personnel_id,
      cursor: filters.cursor,
      limit: filters.limit ?? 25,
    })}`,
    { schema: PayslipPageSchema },
  );
}

export function getPayslip(payslipId: string): Promise<ApiResult<Payslip>> {
  return apiRequest(`/api/v1/payslips/${payslipId}`, { schema: PayslipSchema });
}

export function requestPayslips(
  batchId: string,
  idempotencyKey: string,
): Promise<ApiResult<PayslipGenerateResponse>> {
  return apiRequest(`/api/v1/payroll/batches/${batchId}/payslips`, {
    method: "POST",
    body: {},
    idempotencyKey,
    schema: PayslipGenerateResponseSchema,
  });
}

export function downloadPayslip(payslipId: string): Promise<ApiResult<FileDownloadResponse>> {
  return apiRequest(`/api/v1/payslips/${payslipId}/download`, {
    schema: FileDownloadResponseSchema,
  });
}

export interface ReportFilters {
  report_type?: ReportType | undefined;
  period_month?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export function listReports(filters: ReportFilters = {}): Promise<ApiResult<TaxReportPage>> {
  return apiRequest(
    `/api/v1/reports${toQuery({
      report_type: filters.report_type,
      period_month: filters.period_month,
      cursor: filters.cursor,
      limit: filters.limit ?? 25,
    })}`,
    { schema: TaxReportPageSchema },
  );
}

export function generateReport(
  input: GenerateReportRequest,
  idempotencyKey: string,
): Promise<ApiResult<TaxReport>> {
  return apiRequest("/api/v1/reports", {
    method: "POST",
    body: input,
    idempotencyKey,
    schema: TaxReportSchema,
  });
}

export function downloadReport(reportId: string): Promise<ApiResult<FileDownloadResponse>> {
  return apiRequest(`/api/v1/reports/${reportId}/download`, {
    schema: FileDownloadResponseSchema,
  });
}
