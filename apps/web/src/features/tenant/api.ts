import { useQuery } from "@tanstack/react-query";

import {
  TenantProfileSchema,
  tenantPlanHasFeature,
  type TenantFeature,
  type TenantProfile,
} from "@aletheia/shared-contracts";

import { apiRequest, type ApiResult } from "../../shared/api/client";
import { useAuth } from "../auth/AuthProvider";

export function getTenantProfile(): Promise<ApiResult<TenantProfile>> {
  return apiRequest("/api/v1/tenant", { schema: TenantProfileSchema });
}

export function useTenantProfile(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tenant-profile", user?.tenant_id ?? "anonymous"],
    queryFn: getTenantProfile,
    staleTime: 300_000,
    enabled: enabled && user !== null,
  });
}

export function hasFeature(profile: TenantProfile | undefined, feature: TenantFeature): boolean {
  if (profile === undefined) {
    return false;
  }
  return tenantPlanHasFeature(profile.plan, feature);
}
