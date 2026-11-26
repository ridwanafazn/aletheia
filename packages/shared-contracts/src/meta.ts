export const API_VERSION = "v1" as const;

export type ApiVersion = typeof API_VERSION;

export type ServiceName =
  | "governance-service"
  | "claims-service"
  | "payroll-service"
  | "analytics-worker-go"
  | "edge-gateway"
  | "web";

export interface HealthResponse {
  status: "ok" | "degraded";
  service: ServiceName;
  version: ApiVersion;
}
