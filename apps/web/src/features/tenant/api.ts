import { useQuery } from "@tanstack/react-query";

import {
  TenantProfileSchema,
  tenantPlanHasFeature,
  type TenantFeature,
  type TenantProfile,
} from "@aletheia/shared-contracts";

import { apiRequest, type ApiResult } from "../../shared/api/client";

export function getTenantProfile(): Promise<ApiResult<TenantProfile>> {
  return apiRequest("/api/v1/tenant", { schema: TenantProfileSchema });
}

export function useTenantProfile(enabled = true) {
  return useQuery({
    queryKey: ["tenant-profile"],
    queryFn: getTenantProfile,
    staleTime: 300_000,
    enabled,
  });
}

export function hasFeature(profile: TenantProfile | undefined, feature: TenantFeature): boolean {
  if (profile === undefined) {
    return true;
  }
  return tenantPlanHasFeature(profile.plan, feature);
}
