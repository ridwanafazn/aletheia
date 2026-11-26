import {
  PayrollBranchListResponseSchema,
  type PayrollBranchListResponse,
} from "@aletheia/shared-contracts";

import { apiRequest, type ApiResult } from "../api/client";

export function listBranches(): Promise<ApiResult<PayrollBranchListResponse>> {
  return apiRequest("/api/v1/payroll/branches", {
    schema: PayrollBranchListResponseSchema,
  });
}
