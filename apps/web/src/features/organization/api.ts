import { OrganizationTreeSchema, type OrganizationTree } from "@aletheia/shared-contracts";

import { apiRequest, type ApiResult } from "../../shared/api/client";

export function getOrganization(): Promise<ApiResult<OrganizationTree>> {
  return apiRequest("/api/v1/organization", { schema: OrganizationTreeSchema });
}
