import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildSchema, printSchema } from "graphql";

import { createEdgeApp } from "./app.js";
import type { EdgeConfig } from "./config.js";
import { signHmacSha256, signaturePayload } from "./lib/crypto.js";
import { MemoryRateLimiter } from "./lib/rate-limit.js";
import { schemaGraphql } from "./graphql/schema.js";
import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

const TENANT = "019361a2-7c00-7000-8000-000000000001";
const BRANCH = "019361a2-7c00-7000-8000-000000000011";
const MANAGER = "019361a2-7c00-7000-8000-000000000022";
const SECRET = "test-edge-gateway-secret";

let privateKey: CryptoKey;
let publicKey: string;
let config: EdgeConfig;

interface Capture {
  url: string;
  headers: Headers;
  body: string;
}

function jsonEnvelope(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(
    JSON.stringify({
      success: status < 400,
      correlation_id: "019361a2-7c00-7000-8000-000000000099",
      data,
      error: null,
    }),
    {
      status,
      headers: { "content-type": "application/json", ...extraHeaders },
    },
  );
}

async function accessToken(role = "BRANCH_MANAGER"): Promise<string> {
  return new SignJWT({ tid: TENANT, role, branch_id: BRANCH })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setSubject(MANAGER)
    .setIssuer("aletheia")
    .setAudience("aletheia-web")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(privateKey);
}

function build(handler: (capture: Capture) => Response | Promise<Response>) {
  const captures: Capture[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const capture: Capture = {
      url: String(input),
      headers,
      body:
        init?.body === undefined || init.body === null
          ? ""
          : typeof init.body === "string"
            ? init.body
            : init.body instanceof ArrayBuffer
              ? new TextDecoder().decode(init.body)
              : init.body instanceof Uint8Array
                ? new TextDecoder().decode(init.body)
                : "",
    };
    captures.push(capture);
    return handler(capture);
  }) as typeof fetch;

  const app = createEdgeApp(config, {
    fetchImpl,
    rateLimiter: new MemoryRateLimiter(),
  });
  return { app, captures };
}

beforeAll(async () => {
  const keys = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  privateKey = keys.privateKey;
  const spki = Buffer.from(await crypto.subtle.exportKey("spki", keys.publicKey));
  const base64 = spki.toString("base64");
  publicKey = [
    "-----BEGIN PUBLIC KEY-----",
    ...(base64.match(/.{1,64}/g) ?? []),
    "-----END PUBLIC KEY-----",
  ].join("\n");
  config = {
    environment: "test",
    governanceUrl: "http://governance.test",
    claimsUrl: "http://claims.test",
    payrollUrl: "http://payroll.test",
    jwtPublicKey: publicKey,
    jwtIssuer: "aletheia",
    jwtAudience: "aletheia-web",
    internalGatewaySecret: SECRET,
    webOrigin: "http://web.test",
    cookieCrossSite: false,
    upstashUrl: undefined,
    upstashToken: undefined,
    rateLimitAuthMax: 10,
    rateLimitMutationMax: 30,
    rateLimitGraphqlMax: 20,
    rateLimitReadMax: 120,
    rateLimitWindowSeconds: 60,
    graphqlMaxDepth: 4,
  };
});

describe("edge gateway", () => {
  it("menjaga schema.graphql tetap sama dengan SDL runtime", () => {
    const file = readFileSync(new URL("../schema.graphql", import.meta.url), "utf8");
    expect(printSchema(buildSchema(file))).toBe(printSchema(buildSchema(schemaGraphql)));
  });

  it("melayani health tanpa autentikasi", async () => {
    const { app } = build(() => jsonEnvelope({}));
    const response = await app.request("/healthz");
    expect(response.status).toBe(200);
    expect((await response.json()).service).toBe("edge-gateway");
  });

  it("menolak endpoint terlindungi tanpa token atau token rusak", async () => {
    const { app } = build(() => jsonEnvelope({}));
    expect((await app.request("/api/v1/claims")).status).toBe(401);
    expect(
      (
        await app.request("/api/v1/claims", {
          headers: { authorization: "Bearer bukan-token" },
        })
      ).status,
    ).toBe(401);
  });

  it("menandatangani login sebagai identitas publik", async () => {
    const { app, captures } = build(() =>
      jsonEnvelope({ access_token: "token" }, 200, {
        "set-cookie": "aletheia_refresh=abc; Path=/api/v1/auth; SameSite=Strict; HttpOnly",
      }),
    );
    const body = JSON.stringify({ email: "manager@aletheia.id", password: "AletheiaDemo!2026" });
    const response = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://web.test" },
      body,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://web.test");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");

    const upstream = captures[0]!;
    expect(upstream.url).toBe("http://governance.test/api/v1/auth/login");
    expect(upstream.headers.get("x-user-role")).toBe("PUBLIC");
    expect(upstream.headers.get("x-body-sha256")).toBe(
      createHash("sha256").update(body).digest("hex"),
    );

    const expected = await signHmacSha256(
      signaturePayload({
        method: "POST",
        path: "/api/v1/auth/login",
        bodySha256: upstream.headers.get("x-body-sha256")!,
        identity: {
          userId: "00000000-0000-0000-0000-000000000000",
          role: "PUBLIC",
          branchId: "00000000-0000-0000-0000-000000000000",
          tenantId: "00000000-0000-0000-0000-000000000000",
        },
        timestamp: upstream.headers.get("x-gateway-timestamp")!,
      }),
      SECRET,
    );
    expect(upstream.headers.get("x-gateway-signature")).toBe(expected);
  });

  it("meneruskan identitas JWT ke claims service", async () => {
    const { app, captures } = build(() => jsonEnvelope({ items: [] }));
    const response = await app.request("/api/v1/claims?limit=5", {
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        "idempotency-key": "test-idempotency-key",
      },
    });
    expect(response.status).toBe(200);
    const upstream = captures[0]!;
    expect(upstream.url).toBe("http://claims.test/api/v1/claims?limit=5");
    expect(upstream.headers.get("x-user-id")).toBe(MANAGER);
    expect(upstream.headers.get("x-user-role")).toBe("BRANCH_MANAGER");
    expect(upstream.headers.get("x-branch-id")).toBe(BRANCH);
    expect(upstream.headers.get("x-tenant-id")).toBe(TENANT);
    expect(upstream.headers.get("x-request-path")).toBe("/api/v1/claims");
    expect(upstream.headers.get("idempotency-key")).toBe("test-idempotency-key");
  });

  it("menulis ulang cookie refresh untuk origin lintas situs", async () => {
    const crossSite: EdgeConfig = { ...config, cookieCrossSite: true };
    const app = createEdgeApp(crossSite, {
      fetchImpl: (async () =>
        jsonEnvelope({ access_token: "token" }, 200, {
          "set-cookie": "aletheia_refresh=abc; Path=/api/v1/auth; SameSite=Strict; HttpOnly",
        })) as typeof fetch,
      rateLimiter: new MemoryRateLimiter(),
    });
    const response = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.c", password: "AletheiaDemo!2026" }),
    });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");
  });

  it("meneruskan endpoint payroll ke payroll service", async () => {
    const { app, captures } = build(() => jsonEnvelope({ items: [] }));
    const path = "/api/v1/payroll/batches";
    const response = await app.request(path, {
      headers: { authorization: `Bearer ${await accessToken("FINANCE_MANAGER")}` },
    });
    expect(response.status).toBe(200);
    expect(captures[0]!.url).toBe("http://payroll.test/api/v1/payroll/batches");
    expect(captures[0]!.headers.get("x-user-role")).toBe("FINANCE_MANAGER");
  });

  it("meneruskan berkas payroll publik dan webhook payroll", async () => {
    const { app, captures } = build(() => jsonEnvelope({ received: true }));
    const fileResponse = await app.request("/api/v1/payroll-files/token-demo");
    expect(fileResponse.status).toBe(200);
    expect(captures[0]!.url).toBe("http://payroll.test/api/v1/payroll-files/token-demo");

    const webhookResponse = await app.request("/api/v1/payroll/payments/webhook/MOCK", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature: "x", body: {} }),
    });
    expect(webhookResponse.status).toBe(200);
    expect(captures[1]!.url).toBe("http://payroll.test/api/v1/payroll/payments/webhook/MOCK");
  });

  it("mengembalikan 429 setelah batas login terlampaui", async () => {
    const limited: EdgeConfig = { ...config, rateLimitAuthMax: 2 };
    const app = createEdgeApp(limited, {
      fetchImpl: (async () => jsonEnvelope({ access_token: "token" })) as typeof fetch,
      rateLimiter: new MemoryRateLimiter(),
    });
    const request = () =>
      app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.c", password: "AletheiaDemo!2026" }),
      });
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    const third = await request();
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).not.toBeNull();
  });

  it("mengirim security headers pada respons edge", async () => {
    const { app } = build(() => jsonEnvelope({}));
    const response = await app.request("/healthz", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  });

  it("menjawab preflight CORS hanya untuk origin yang diizinkan", async () => {
    const { app } = build(() => jsonEnvelope({}));
    const allowed = await app.request("/api/v1/claims", {
      method: "OPTIONS",
      headers: {
        origin: "http://web.test",
        "access-control-request-method": "GET",
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");

    const denied = await app.request("/api/v1/claims", {
      method: "OPTIONS",
      headers: {
        origin: "http://evil.test",
        "access-control-request-method": "GET",
      },
    });
    expect(denied.status).toBe(403);
  });

  it("meneruskan webhook payment sebagai publik", async () => {
    const { app, captures } = build(() => jsonEnvelope({ received: true }));
    const body = JSON.stringify({ signature: "sig", body: {} });
    const response = await app.request("/api/v1/claims/payments/webhook/MOCK", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(response.status).toBe(200);
    expect(captures[0]!.headers.get("x-user-role")).toBe("PUBLIC");
    expect(captures[0]!.url).toBe("http://claims.test/api/v1/claims/payments/webhook/MOCK");
  });

  it("mengagregasi GraphQL tanpa N plus satu", async () => {
    const claim = {
      id: "019361a2-7c00-7000-8000-000000000501",
      claim_number: "CLM-SAU-202611-000001",
      claimant_name: "Andi",
      claimant_nik_masked: "3273********0011",
      bank_account_masked: "******3334",
      claim_category: "HEALTH",
      requested_amount: "5000000.00",
      approved_amount: null,
      risk_score: 20,
      status: "UNDER_REVIEW",
      policy_version_tag: "v2026.11.01",
      bound_policy_rules: { sla_target_hours: 48 },
      documents: [],
      anomaly_flags: [],
      audit_history: [],
    };

    const { app, captures } = build((capture) => {
      if (capture.url.includes("/internal/v1/analytics/mis-summary")) {
        return jsonEnvelope({
          items: [
            {
              branch_id: BRANCH,
              branch_code: "BDG-01",
              branch_name: "Bandung",
              report_month: "2026-11-01",
              total_claims_submitted: 3,
              total_claims_approved_amount: "5000000.00",
              claim_approval_rate_pct: "33.33",
              avg_turnaround_hours: "4.50",
              total_payroll_disbursed: "10000000.00",
              total_pph21_collected: "500000.00",
              budget_utilization_pct: "1.00",
              mom_variance_pct: "0",
            },
          ],
        });
      }
      if (capture.url.includes("/internal/v1/analytics/what-if")) {
        return jsonEnvelope({
          items: [
            {
              id: "019361a2-7c00-7000-8000-000000000502",
              simulation_name: "Simulasi",
              base_policy_version_tag: "v2026.11.01",
              actual_total_cost: "1000.00",
              simulated_total_cost: "1100.00",
              variance_amount: "100.00",
              variance_percentage: "10.00",
              impact_breakdown: {},
              created_at: "2026-11-25T00:00:00.000Z",
            },
          ],
        });
      }
      return jsonEnvelope(claim);
    });

    const query = `query {
      misExecutiveSummary(reportMonth: "2026-11") { branchCode totalClaimsSubmitted }
      a: claimAuditDetail(claimId: "019361a2-7c00-7000-8000-000000000501") { claimNumber status }
      b: claimAuditDetail(claimId: "019361a2-7c00-7000-8000-000000000501") { claimantNikMasked }
      whatIfSimulations(limit: 5) { simulationName variancePercentage }
    }`;
    const response = await app.request("/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await accessToken("MIS_ANALYST")}`,
      },
      body: JSON.stringify({ query }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.errors).toBeUndefined();
    expect(payload.data.misExecutiveSummary[0].branchCode).toBe("BDG-01");
    expect(payload.data.a.status).toBe("UNDER_REVIEW");
    expect(payload.data.b.claimantNikMasked).toBe("3273********0011");
    expect(response.headers.get("x-bff-upstream-calls")).toBe("3");
    expect(captures).toHaveLength(3);
  });

  it("menyajikan tren MIS dan mutation What-If", async () => {
    const { app, captures } = build((capture) => {
      if (capture.url.includes("/internal/v1/analytics/mis-trend")) {
        return jsonEnvelope({
          items: [
            {
              branch_id: BRANCH,
              branch_code: "BDG-01",
              branch_name: "Bandung",
              report_month: "2026-10-01",
              total_claims_submitted: 2,
              total_claims_approved_amount: "1000.00",
              claim_approval_rate_pct: "50.00",
              avg_turnaround_hours: "2.00",
              total_payroll_disbursed: "500.00",
              total_pph21_collected: "10.00",
              budget_utilization_pct: "0.10",
              mom_variance_pct: "0",
            },
          ],
        });
      }
      return jsonEnvelope({
        event_id: "019361a2-7c00-7000-8000-000000000601",
        status: "QUEUED",
        enqueued: false,
        requested_at: "2026-11-26T00:00:00.000Z",
      });
    });
    const token = await accessToken("MIS_ANALYST");
    const trendQuery = `query { misTrend(reportMonth: "2026-11", months: 3) { branchCode reportMonth } }`;
    const trend = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: trendQuery }),
    });
    const trendPayload = (await trend.json()) as {
      data: { misTrend: Array<{ branchCode: string }> };
      errors?: unknown[];
    };
    expect(trendPayload.errors).toBeUndefined();
    expect(trendPayload.data.misTrend[0]?.branchCode).toBe("BDG-01");

    const mutation = `mutation {
      runWhatIfSimulation(input: {
        simulationName: "Komisi naik",
        basePolicyVersionId: "019361a2-7c00-7000-8000-000000000102",
        simulatedRulesPayload: { commission_mode: "FLAT_TIER" },
        targetPeriodStart: "2026-11-01",
        targetPeriodEnd: "2026-11-30"
      }) { eventId status enqueued }
    }`;
    const whatIf = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: mutation }),
    });
    const whatIfPayload = (await whatIf.json()) as {
      data: { runWhatIfSimulation: { status: string; enqueued: boolean } };
      errors?: unknown[];
    };
    expect(whatIfPayload.errors).toBeUndefined();
    expect(whatIfPayload.data.runWhatIfSimulation.status).toBe("QUEUED");
    expect(whatIfPayload.data.runWhatIfSimulation.enqueued).toBe(false);
    const post = captures.find((capture) => capture.url.includes("/what-if"));
    expect(post?.body).toContain("simulation_name");
    expect(post?.headers.get("x-user-role")).toBe("MIS_ANALYST");
  });

  it("menolak query GraphQL yang terlalu dalam", async () => {
    const { app } = build(() => jsonEnvelope({}));
    const query = `query {
      __schema { types { fields { type { ofType { ofType { name } } } } } }
    }`;
    const response = await app.request("/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await accessToken("MIS_ANALYST")}`,
      },
      body: JSON.stringify({ query }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.errors[0].message).toContain("Kedalaman query");
  });
});
