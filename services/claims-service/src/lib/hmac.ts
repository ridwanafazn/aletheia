import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface GatewayHeaders {
  userId: string;
  role: string;
  branchId: string;
  tenantId: string;
  timestamp: string;
  requestMethod: string;
  requestPath: string;
  bodySha256: string;
  signature: string;
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function computeBodySha256(body: Buffer | undefined): string {
  return sha256Hex(body ?? Buffer.alloc(0));
}

export function signaturePayload(input: Omit<GatewayHeaders, "signature">): string {
  return [
    input.requestMethod,
    input.requestPath,
    input.bodySha256,
    input.userId,
    input.role,
    input.branchId,
    input.tenantId,
    input.timestamp,
  ].join(":");
}

export function signGatewayHeaders(
  input: Omit<GatewayHeaders, "signature">,
  secret: string,
): string {
  return createHmac("sha256", secret).update(signaturePayload(input)).digest("hex");
}

export function verifyGatewaySignature(input: GatewayHeaders, secret: string): boolean {
  const expected = signGatewayHeaders(input, secret);
  const received = input.signature.toLowerCase();
  if (received.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
