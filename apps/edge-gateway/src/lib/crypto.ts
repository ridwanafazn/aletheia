const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes =
    typeof input === "string"
      ? encoder.encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  const copy = new Uint8Array(bytes);
  return toHex(await crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer));
}

export async function signHmacSha256(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload) as BufferSource));
}

export interface GatewayIdentity {
  userId: string;
  role: string;
  branchId: string;
  tenantId: string;
}

export function signaturePayload(input: {
  method: string;
  path: string;
  bodySha256: string;
  identity: GatewayIdentity;
  timestamp: string;
}): string {
  return [
    input.method,
    input.path,
    input.bodySha256,
    input.identity.userId,
    input.identity.role,
    input.identity.branchId,
    input.identity.tenantId,
    input.timestamp,
  ].join(":");
}
