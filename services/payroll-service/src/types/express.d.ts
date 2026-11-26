import type { Role } from "@aletheia/shared-contracts";

export interface GatewayIdentity {
  userId: string;
  role: Role | "PUBLIC";
  branchId: string;
  tenantId: string;
  correlationId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: GatewayIdentity;
      correlationId: string;
      rawBody?: Buffer;
    }
  }
}

export {};
