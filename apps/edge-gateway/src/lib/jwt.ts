import { importSPKI, jwtVerify, type JWTPayload } from "jose";

import { RoleSchema, UuidSchema } from "@aletheia/shared-contracts";

import type { GatewayIdentity } from "./crypto.js";

export interface SessionIdentity extends GatewayIdentity {
  expiresAt: number;
}

export interface JwtSettings {
  publicKey: string;
  issuer: string;
  audience: string;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function publicKeyFor(pem: string): Promise<CryptoKey> {
  let cached = keyCache.get(pem);
  if (cached === undefined) {
    cached = importSPKI(pem, "EdDSA");
    keyCache.set(pem, cached);
  }
  return cached;
}

function claimString(payload: JWTPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

export async function verifyAccessToken(
  token: string,
  settings: JwtSettings,
): Promise<SessionIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, await publicKeyFor(settings.publicKey), {
      issuer: settings.issuer,
      audience: settings.audience,
      algorithms: ["EdDSA"],
    });

    const userId = payload.sub;
    const tenantId = claimString(payload, "tid");
    const branchId = claimString(payload, "branch_id");
    const role = claimString(payload, "role");

    if (
      userId === undefined ||
      tenantId === null ||
      branchId === null ||
      role === null ||
      !UuidSchema.safeParse(userId).success ||
      !UuidSchema.safeParse(tenantId).success ||
      !UuidSchema.safeParse(branchId).success ||
      !RoleSchema.safeParse(role).success ||
      payload.exp === undefined
    ) {
      return null;
    }

    return {
      userId,
      tenantId,
      branchId,
      role,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}
