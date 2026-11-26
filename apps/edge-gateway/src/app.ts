import { Hono, type Context } from "hono";

import type { EdgeConfig } from "./config.js";
import { createEdgeGraphql, inspectGraphqlQuery } from "./graphql/index.js";
import { BffClient } from "./graphql/bff.js";
import type { GatewayIdentity } from "./lib/crypto.js";
import {
  applyCors,
  authority,
  correlationId as resolveCorrelationId,
  corsPreflight,
  errorResponse,
} from "./lib/http.js";
import { verifyAccessToken, type SessionIdentity } from "./lib/jwt.js";
import { proxyToService } from "./lib/proxy.js";
import { MemoryRateLimiter, type RateLimiter } from "./lib/rate-limit.js";
import { resolveTraceparent, traceIdFrom } from "./lib/trace.js";

const PUBLIC_IDENTITY: GatewayIdentity = {
  userId: "00000000-0000-0000-0000-000000000000",
  role: "PUBLIC",
  branchId: "00000000-0000-0000-0000-000000000000",
  tenantId: "00000000-0000-0000-0000-000000000000",
};

interface Variables {
  correlationId: string;
  identity: SessionIdentity;
  traceparent: string;
}

type EdgeContext = Context<{ Variables: Variables }>;

export interface EdgeDependencies {
  fetchImpl?: typeof fetch;
  rateLimiter?: RateLimiter;
}

async function authenticate(c: EdgeContext, config: EdgeConfig): Promise<SessionIdentity | null> {
  const header = c.req.header("authorization");
  if (header === undefined || !header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return verifyAccessToken(header.slice(7).trim(), {
    publicKey: config.jwtPublicKey,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });
}

async function graphqlQueryText(request: Request): Promise<string | null> {
  if (request.method === "GET") {
    return new URL(request.url).searchParams.get("query");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    const body = (await request.clone().json()) as unknown;
    if (
      typeof body === "object" &&
      body !== null &&
      "query" in body &&
      typeof (body as { query?: unknown }).query === "string"
    ) {
      return (body as { query: string }).query;
    }
  } catch {
    return null;
  }
  return null;
}

async function enforceLimit(
  c: EdgeContext,
  limiter: RateLimiter,
  config: EdgeConfig,
  bucket: string,
  subject: string,
  limit: number,
): Promise<Response | null> {
  const result = await limiter.consume(
    `aletheia:edge:${bucket}:${subject}`,
    limit,
    config.rateLimitWindowSeconds,
  );
  if (result.allowed) {
    return null;
  }

  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      success: false,
      correlation_id: c.get("correlationId"),
      data: null,
      error: {
        code: "ERR_RATE_LIMIT_EXCEEDED",
        message: "Batas permintaan terlampaui",
        correlation_id: c.get("correlationId"),
        retryable: true,
      },
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "rate-limit-limit": String(result.limit),
        "rate-limit-remaining": "0",
        "rate-limit-reset": String(Math.floor(result.resetAt / 1000)),
        "retry-after": String(retryAfter),
      },
    },
  );
}

function unauthorized(c: EdgeContext): Response {
  return errorResponse(
    401,
    "ERR_UNAUTHORIZED_ACCESS",
    "Autentikasi diperlukan",
    c.get("correlationId"),
  );
}

export function createEdgeApp(config: EdgeConfig, deps: EdgeDependencies = {}) {
  const app = new Hono<{ Variables: Variables }>();
  const limiter = deps.rateLimiter ?? new MemoryRateLimiter();
  const yoga = createEdgeGraphql(config);
  const fetchImpl = deps.fetchImpl;

  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    c.set("correlationId", resolveCorrelationId(c.req.raw));
    c.set("traceparent", resolveTraceparent(c.req.header("traceparent")));
    await next();
    c.header("x-correlation-id", c.get("correlationId"));
    c.header("x-trace-id", traceIdFrom(c.get("traceparent")));
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "no-referrer");
    c.header("x-frame-options", "DENY");
    c.header("cross-origin-opener-policy", "same-origin");
    c.header("cross-origin-resource-policy", "same-site");
    c.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
    c.header(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const forwardedProto = c.req.header("x-forwarded-proto");
    if (c.req.url.startsWith("https://") || forwardedProto === "https") {
      c.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    c.res = applyCors(c.res, c.req.raw, config.webOrigin);
    console.log(
      JSON.stringify({
        level: "info",
        service: "edge-gateway",
        trace_id: traceIdFrom(c.get("traceparent")),
        correlation_id: c.get("correlationId"),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        duration_ms: Date.now() - startedAt,
      }),
    );
  });

  app.options("*", (c) => corsPreflight(c.req.raw, config.webOrigin));

  app.get("/healthz", (c) =>
    c.json({ status: "ok", service: "edge-gateway", environment: config.environment }),
  );

  app.get("/readyz", async (c) => {
    const probe = async (url: string) => {
      try {
        const response = await (fetchImpl ?? fetch)(`${url}/healthz`, {
          signal: AbortSignal.timeout(2_000),
        });
        return response.ok;
      } catch {
        return false;
      }
    };
    const [governance, claims, payroll] = await Promise.all([
      probe(config.governanceUrl),
      probe(config.claimsUrl),
      probe(config.payrollUrl),
    ]);
    if (!governance || !claims || !payroll) {
      return c.json({ status: "degraded", service: "edge-gateway" }, 503);
    }
    return c.json({ status: "ready", service: "edge-gateway" });
  });

  app.post("/api/v1/auth/login", async (c) => {
    const limit = await enforceLimit(
      c,
      limiter,
      config,
      "auth",
      authority(c.req.raw),
      config.rateLimitAuthMax,
    );
    if (limit !== null) {
      return limit;
    }
    return proxyToService({
      request: c.req.raw,
      targetBase: config.governanceUrl,
      identity: PUBLIC_IDENTITY,
      secret: config.internalGatewaySecret,
      correlationId: c.get("correlationId"),
      traceparent: c.get("traceparent"),
      cookieCrossSite: config.cookieCrossSite,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
  });

  app.post("/api/v1/auth/refresh", async (c) => {
    const limit = await enforceLimit(
      c,
      limiter,
      config,
      "auth",
      authority(c.req.raw),
      config.rateLimitAuthMax,
    );
    if (limit !== null) {
      return limit;
    }
    return proxyToService({
      request: c.req.raw,
      targetBase: config.governanceUrl,
      identity: PUBLIC_IDENTITY,
      secret: config.internalGatewaySecret,
      correlationId: c.get("correlationId"),
      traceparent: c.get("traceparent"),
      cookieCrossSite: config.cookieCrossSite,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
  });

  app.all("/api/v1/claims/payments/webhook/*", async (c) => {
    const limit = await enforceLimit(
      c,
      limiter,
      config,
      "webhook",
      authority(c.req.raw),
      config.rateLimitAuthMax,
    );
    if (limit !== null) {
      return limit;
    }
    return proxyToService({
      request: c.req.raw,
      targetBase: config.claimsUrl,
      identity: PUBLIC_IDENTITY,
      secret: config.internalGatewaySecret,
      correlationId: c.get("correlationId"),
      traceparent: c.get("traceparent"),
      cookieCrossSite: config.cookieCrossSite,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
  });

  app.all("/api/v1/payroll/payments/webhook/*", async (c) => {
    const limit = await enforceLimit(
      c,
      limiter,
      config,
      "webhook",
      authority(c.req.raw),
      config.rateLimitAuthMax,
    );
    if (limit !== null) {
      return limit;
    }
    return proxyToService({
      request: c.req.raw,
      targetBase: config.payrollUrl,
      identity: PUBLIC_IDENTITY,
      secret: config.internalGatewaySecret,
      correlationId: c.get("correlationId"),
      traceparent: c.get("traceparent"),
      cookieCrossSite: config.cookieCrossSite,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
  });

  app.get("/api/v1/payroll-files/*", async (c) => {
    const limit = await enforceLimit(
      c,
      limiter,
      config,
      "read",
      authority(c.req.raw),
      config.rateLimitReadMax,
    );
    if (limit !== null) {
      return limit;
    }
    return proxyToService({
      request: c.req.raw,
      targetBase: config.payrollUrl,
      identity: PUBLIC_IDENTITY,
      secret: config.internalGatewaySecret,
      correlationId: c.get("correlationId"),
      traceparent: c.get("traceparent"),
      cookieCrossSite: config.cookieCrossSite,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
  });

  app.use("/api/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path === "/api/v1/auth/login" || path === "/api/v1/auth/refresh") {
      await next();
      return;
    }

    const identity = await authenticate(c, config);
    if (identity === null) {
      c.res = unauthorized(c);
      return;
    }
    c.set("identity", identity);

    const mutation = !["GET", "HEAD", "OPTIONS"].includes(c.req.method);
    const bucket = mutation ? "mutation" : "read";
    const limitValue = mutation ? config.rateLimitMutationMax : config.rateLimitReadMax;
    const limited = await enforceLimit(c, limiter, config, bucket, identity.userId, limitValue);
    if (limited !== null) {
      c.res = limited;
      return;
    }

    const target = path.startsWith("/api/v1/claims")
      ? config.claimsUrl
      : path.startsWith("/api/v1/payroll") ||
          path.startsWith("/api/v1/employees") ||
          path.startsWith("/api/v1/attendance") ||
          path.startsWith("/api/v1/sales-achievements") ||
          path.startsWith("/api/v1/leave-requests") ||
          path.startsWith("/api/v1/leave-balances") ||
          path.startsWith("/api/v1/overtime-requests") ||
          path.startsWith("/api/v1/reimbursements") ||
          path.startsWith("/api/v1/organization") ||
          path.startsWith("/api/v1/me") ||
          path.startsWith("/api/v1/payslips") ||
          path.startsWith("/api/v1/reports")
        ? config.payrollUrl
        : config.governanceUrl;
    c.res = await proxyToService({
      request: c.req.raw,
      targetBase: target,
      identity,
      secret: config.internalGatewaySecret,
      correlationId: c.get("correlationId"),
      traceparent: c.get("traceparent"),
      cookieCrossSite: config.cookieCrossSite,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
  });

  app.all("/graphql", async (c) => {
    if (c.req.method !== "POST" && c.req.method !== "GET") {
      return errorResponse(
        405,
        "ERR_VALIDATION_FAILED",
        "Method GraphQL tidak didukung",
        c.get("correlationId"),
      );
    }

    const identity = await authenticate(c, config);
    if (identity === null) {
      return unauthorized(c);
    }
    const limited = await enforceLimit(
      c,
      limiter,
      config,
      "graphql",
      identity.userId,
      config.rateLimitGraphqlMax,
    );
    if (limited !== null) {
      return limited;
    }

    const query = await graphqlQueryText(c.req.raw);
    if (query !== null) {
      const queryError = inspectGraphqlQuery(query, config);
      if (queryError !== null) {
        return Response.json(
          { errors: [queryError.toJSON()] },
          { headers: { "x-correlation-id": c.get("correlationId") } },
        );
      }
    }

    const bff = new BffClient({
      config,
      identity,
      correlationId: c.get("correlationId"),
      traceparent: c.get("traceparent"),
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
    const response = await yoga.fetch(c.req.raw, { bff, identity });
    const headers = new Headers(response.headers);
    headers.set("x-correlation-id", c.get("correlationId"));
    headers.set("x-bff-upstream-calls", String(bff.upstreamCalls));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });

  app.all("/graphql/*", (c) =>
    errorResponse(404, "ERR_NOT_FOUND", "Endpoint GraphQL tidak ditemukan", c.get("correlationId")),
  );

  app.all("*", (c) =>
    errorResponse(404, "ERR_NOT_FOUND", "Endpoint tidak ditemukan", c.get("correlationId")),
  );

  app.onError((error, c) => {
    console.error(
      JSON.stringify({
        level: "error",
        service: "edge-gateway",
        correlation_id: c.get("correlationId"),
        error: error.message,
      }),
    );
    return errorResponse(
      500,
      "ERR_INTERNAL_ERROR",
      "Kesalahan internal edge gateway",
      c.get("correlationId"),
    );
  });

  return app;
}
