import { sha256Hex, signHmacSha256, signaturePayload, type GatewayIdentity } from "./crypto.js";
import { errorResponse } from "./http.js";

export interface ProxyOptions {
  request: Request;
  targetBase: string;
  identity: GatewayIdentity;
  secret: string;
  correlationId: string;
  traceparent: string;
  cookieCrossSite: boolean;
  fetchImpl?: typeof fetch;
}

function rewriteSetCookie(value: string, crossSite: boolean): string {
  if (!crossSite) {
    return value;
  }
  return value
    .replace(/SameSite=Strict/gi, "SameSite=None")
    .replace(/;\s*Secure/gi, "")
    .concat("; Secure");
}

export interface SignedHeadersInput {
  method: string;
  path: string;
  body: Uint8Array;
  identity: GatewayIdentity;
  secret: string;
  correlationId: string;
  traceparent: string;
}

export async function signedHeaders(input: SignedHeadersInput): Promise<Headers> {
  const timestamp = String(Date.now());
  const bodySha256 = await sha256Hex(input.body);
  const signature = await signHmacSha256(
    signaturePayload({
      method: input.method,
      path: input.path,
      bodySha256,
      identity: input.identity,
      timestamp,
    }),
    input.secret,
  );

  return new Headers({
    "x-user-id": input.identity.userId,
    "x-user-role": input.identity.role,
    "x-branch-id": input.identity.branchId,
    "x-tenant-id": input.identity.tenantId,
    "x-gateway-timestamp": timestamp,
    "x-request-method": input.method,
    "x-request-path": input.path,
    "x-body-sha256": bodySha256,
    "x-gateway-signature": signature,
    "x-correlation-id": input.correlationId,
    traceparent: input.traceparent,
  });
}

export async function proxyToService(options: ProxyOptions): Promise<Response> {
  const url = new URL(options.request.url);
  const path = url.pathname;
  const search = url.search;
  const method = options.request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await options.request.arrayBuffer();
  const bodyBytes = body === undefined ? new Uint8Array() : new Uint8Array(body);
  const headers = await signedHeaders({
    method,
    path,
    body: bodyBytes,
    identity: options.identity,
    secret: options.secret,
    correlationId: options.correlationId,
    traceparent: options.traceparent,
  });

  const contentType = options.request.headers.get("content-type");
  if (contentType !== null) {
    headers.set("content-type", contentType);
  }
  const accept = options.request.headers.get("accept");
  if (accept !== null) {
    headers.set("accept", accept);
  }
  const cookie = options.request.headers.get("cookie");
  if (cookie !== null) {
    headers.set("cookie", cookie);
  }
  const idempotencyKey = options.request.headers.get("idempotency-key");
  if (idempotencyKey !== null) {
    headers.set("idempotency-key", idempotencyKey);
  }

  try {
    const init: RequestInit = {
      method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    };
    if (bodyBytes.byteLength > 0) {
      init.body = bodyBytes;
    }
    const upstream = await (options.fetchImpl ?? fetch)(
      `${options.targetBase.replace(/\/$/, "")}${path}${search}`,
      init,
    );

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (
        key !== "content-encoding" &&
        key !== "content-length" &&
        key !== "transfer-encoding" &&
        key !== "set-cookie"
      ) {
        responseHeaders.set(key, value);
      }
    });

    const cookies = upstream.headers.getSetCookie();
    for (const cookieValue of cookies) {
      responseHeaders.append("set-cookie", rewriteSetCookie(cookieValue, options.cookieCrossSite));
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return errorResponse(
      502,
      "ERR_INTERNAL_ERROR",
      "Layanan internal tidak tersedia",
      options.correlationId,
      true,
    );
  }
}
