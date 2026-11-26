import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config.js";

interface FileTokenPayload {
  tenant_id: string;
  kind: "PAYSLIP" | "REPORT";
  entity_id: string;
  exp: number;
}

function secret(): string {
  return env.FILE_SIGNING_SECRET;
}

function sign(encoded: string): string {
  return createHmac("sha256", secret()).update(encoded).digest("base64url");
}

export function signFileToken(input: {
  tenantId: string;
  kind: "PAYSLIP" | "REPORT";
  entityId: string;
}): { token: string; expiresAt: string } {
  const expires = new Date(Date.now() + env.FILE_URL_TTL_SECONDS * 1000);
  const payload: FileTokenPayload = {
    tenant_id: input.tenantId,
    kind: input.kind,
    entity_id: input.entityId,
    exp: Math.floor(expires.getTime() / 1000),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encoded}.${sign(encoded)}`, expiresAt: expires.toISOString() };
}

export function verifyFileToken(token: string): FileTokenPayload | null {
  const [encoded, signature] = token.split(".");
  if (encoded === undefined || signature === undefined) {
    return null;
  }
  const expected = sign(encoded);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as FileTokenPayload;
    if (
      typeof payload.tenant_id !== "string" ||
      (payload.kind !== "PAYSLIP" && payload.kind !== "REPORT") ||
      typeof payload.entity_id !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function signedFilePath(token: string): string {
  return `/api/v1/payroll-files/${token}`;
}
