import { closeDatabase } from "@aletheia/database";
import { adminPool as pool, closeAdminDatabase } from "@aletheia/database/admin";
import { hashPassword } from "./lib/password.js";
import { generateTotpForTest } from "./lib/mfa.js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac, createHash, randomUUID } from "node:crypto";

import { createApp } from "./app.js";

const integrationEnabled = process.env.RUN_GOVERNANCE_INTEGRATION === "true";
const gatewaySecret = "test-internal-gateway-secret";
const app = createApp();

const SAU_TENANT = "019361a2-7c00-7000-8000-000000000001";
const SAU_BRANCH = "019361a2-7c00-7000-8000-000000000010";
const SAU_COMPLIANCE = "019361a2-7c00-7000-8000-000000000025";

const TEST_TENANT = "019361a2-7c00-7000-8000-000000000901";
const TEST_BRANCH = "019361a2-7c00-7000-8000-000000000902";
const TEST_COMPLIANCE = "019361a2-7c00-7000-8000-000000000903";
const TEST_FINANCE = "019361a2-7c00-7000-8000-000000000904";

function gatewayHeaders(
  method: string,
  path: string,
  body: unknown,
  userId: string,
  role: string,
  tenantId: string,
  branchId: string,
): Record<string, string> {
  const bodyText = body === undefined ? "" : JSON.stringify(body);
  const bodyHash = createHash("sha256").update(bodyText).digest("hex");
  const timestamp = String(Date.now());
  const payload = [method, path, bodyHash, userId, role, branchId, tenantId, timestamp].join(":");
  const signature = createHmac("sha256", gatewaySecret).update(payload).digest("hex");
  return {
    "content-type": "application/json",
    "x-user-id": userId,
    "x-user-role": role,
    "x-branch-id": branchId,
    "x-tenant-id": tenantId,
    "x-gateway-timestamp": timestamp,
    "x-request-method": method,
    "x-request-path": path,
    "x-body-sha256": bodyHash,
    "x-gateway-signature": signature,
    "x-correlation-id": randomUUID(),
  };
}

function publicHeaders(method: string, path: string, body: unknown): Record<string, string> {
  const zero = "00000000-0000-0000-0000-000000000000";
  return gatewayHeaders(method, path, body, zero, "PUBLIC", zero, zero);
}

const claimsRules = {
  approval_tiers: {
    level_1_branch_manager_max: "25000000.00",
    level_2_finance_manager_max: "150000000.00",
    auto_escalate_risk_threshold: 65,
    force_escalate_on_conflict: true,
  },
  required_documents_by_category: {
    HEALTH: ["IDENTITY_CARD", "MEDICAL_INVOICE"],
    ACCIDENT: ["IDENTITY_CARD", "MEDICAL_INVOICE", "POLICE_REPORT"],
    PROPERTY: ["IDENTITY_CARD", "POLICY_CERT", "POLICE_REPORT"],
    GUARANTEE: ["IDENTITY_CARD", "POLICY_CERT"],
  },
  optional_documents_by_category: {
    HEALTH: ["POLICY_CERT"],
    ACCIDENT: ["POLICY_CERT"],
    PROPERTY: ["MEDICAL_INVOICE"],
    GUARANTEE: ["MEDICAL_INVOICE"],
  },
  risk_scoring_weights: {
    missing_optional_evidence_points: 15,
    high_amount_ratio_threshold: 0.8,
    high_amount_ratio_points: 25,
    repeat_bank_account_30d_points: 30,
    cross_domain_conflict_points: 50,
  },
  sla_target_hours: 48,
};

describe.skipIf(!integrationEnabled)("governance service integration", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword("TestPassword!123");
    await pool.query(
      `insert into governance.tenants (id, code, name, status)
       values ($1, 'M21', 'M2.1 Test Tenant', 'ACTIVE')
       on conflict (id) do nothing`,
      [TEST_TENANT],
    );
    await pool.query(
      `insert into governance.branches
        (id, tenant_id, code, name, region, monthly_disbursement_cap)
       values ($1, $2, 'M21-01', 'M2.1 Test Branch', 'Test', '1000000000.00')
       on conflict (id) do nothing`,
      [TEST_BRANCH, TEST_TENANT],
    );
    for (const [id, email, role] of [
      [TEST_COMPLIANCE, "compliance@m21.test", "COMPLIANCE_ADMIN"],
      [TEST_FINANCE, "finance@m21.test", "FINANCE_MANAGER"],
    ] as const) {
      await pool.query(
        `insert into governance.users
          (id, tenant_id, branch_id, employee_number, full_name, email, password_hash, role, is_active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, true)
         on conflict (id) do nothing`,
        [
          id,
          TEST_TENANT,
          TEST_BRANCH,
          `M21-${role}`,
          role === "COMPLIANCE_ADMIN" ? "Test Compliance" : "Test Finance",
          email,
          passwordHash,
          role,
        ],
      );
    }
  });

  afterAll(async () => {
    await closeDatabase();
    await closeAdminDatabase();
  });

  it("menolak request tanpa signature gateway", async () => {
    const response = await request(app).get("/api/v1/policies");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("ERR_UNAUTHORIZED_ACCESS");
  });

  it("login berhasil dan menolak password salah", async () => {
    const body = { email: "officer.bdg@aletheia.id", password: "AletheiaDemo!2026" };
    const success = await request(app)
      .post("/api/v1/auth/login")
      .set(publicHeaders("POST", "/api/v1/auth/login", body))
      .send(body);
    expect(success.status).toBe(200);
    expect(success.body.data.access_token).toBeTypeOf("string");

    const failure = await request(app)
      .post("/api/v1/auth/login")
      .set(publicHeaders("POST", "/api/v1/auth/login", { ...body, password: "wrong-password" }))
      .send({ ...body, password: "wrong-password" });
    expect(failure.status).toBe(401);
  });

  it("rotasi refresh token dan mendeteksi reuse", async () => {
    const body = { email: "officer.bdg@aletheia.id", password: "AletheiaDemo!2026" };
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set(publicHeaders("POST", "/api/v1/auth/login", body))
      .send(body);
    const cookieHeader = login.headers["set-cookie"];
    const cookie = Array.isArray(cookieHeader) ? cookieHeader[0]?.split(";")[0] : undefined;
    expect(cookie).toBeDefined();

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .set(publicHeaders("POST", "/api/v1/auth/refresh", undefined))
      .set("cookie", cookie!);
    expect(refreshed.status).toBe(200);

    const reused = await request(app)
      .post("/api/v1/auth/refresh")
      .set(publicHeaders("POST", "/api/v1/auth/refresh", undefined))
      .set("cookie", cookie!);
    expect(reused.status).toBe(401);
  });

  it("menerbitkan policy baru dan mengarsipkan policy aktif lama", async () => {
    const version = `v2026.12.${String(Date.now()).slice(-4)}`;
    const createBody = {
      domain: "CLAIMS_POLICY",
      version_tag: version,
      rules_payload: claimsRules,
      effective_from: "2026-12-01T00:00:00.000Z",
    };
    const created = await request(app)
      .post("/api/v1/policies")
      .set(
        gatewayHeaders(
          "POST",
          "/api/v1/policies",
          createBody,
          TEST_COMPLIANCE,
          "COMPLIANCE_ADMIN",
          TEST_TENANT,
          TEST_BRANCH,
        ),
      )
      .send(createBody);
    expect(created.status).toBe(201);
    const policyId = created.body.data.id as string;

    const approved = await request(app)
      .post(`/api/v1/policies/${policyId}/approve`)
      .set(
        gatewayHeaders(
          "POST",
          `/api/v1/policies/${policyId}/approve`,
          { notes: "Approved for integration test" },
          TEST_FINANCE,
          "FINANCE_MANAGER",
          TEST_TENANT,
          TEST_BRANCH,
        ),
      )
      .send({ notes: "Approved for integration test" });
    expect(approved.status).toBe(200);

    const published = await request(app)
      .post(`/api/v1/policies/${policyId}/publish`)
      .set(
        gatewayHeaders(
          "POST",
          `/api/v1/policies/${policyId}/publish`,
          {},
          TEST_COMPLIANCE,
          "COMPLIANCE_ADMIN",
          TEST_TENANT,
          TEST_BRANCH,
        ),
      )
      .send({});
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe("ACTIVE");

    const active = await request(app)
      .get("/api/v1/policies/active/CLAIMS_POLICY")
      .set(
        gatewayHeaders(
          "GET",
          "/api/v1/policies/active/CLAIMS_POLICY",
          undefined,
          TEST_COMPLIANCE,
          "COMPLIANCE_ADMIN",
          TEST_TENANT,
          TEST_BRANCH,
        ),
      );
    expect(active.status).toBe(200);
    expect(active.body.data.version_tag).toBe(version);
  });

  it("menolak draft policy yang kehilangan kunci wajib dengan 422", async () => {
    const incompleteRules: Record<string, unknown> = { ...claimsRules };
    delete incompleteRules.sla_target_hours;
    const body = {
      domain: "CLAIMS_POLICY",
      version_tag: "v2026.12.incomplete",
      rules_payload: incompleteRules,
      effective_from: "2026-12-01T00:00:00.000Z",
    };
    const response = await request(app)
      .post("/api/v1/policies")
      .set(
        gatewayHeaders(
          "POST",
          "/api/v1/policies",
          body,
          TEST_COMPLIANCE,
          "COMPLIANCE_ADMIN",
          TEST_TENANT,
          TEST_BRANCH,
        ),
      )
      .send(body);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("ERR_POLICY_RULE_VIOLATION");
  });

  it("menolak maker yang menyetujui draft sendiri", async () => {
    const version = `v2026.12.sod.${String(Date.now()).slice(-4)}`;
    const createBody = {
      domain: "CLAIMS_POLICY",
      version_tag: version,
      rules_payload: claimsRules,
      effective_from: "2026-12-15T00:00:00.000Z",
    };
    const created = await request(app)
      .post("/api/v1/policies")
      .set(
        gatewayHeaders(
          "POST",
          "/api/v1/policies",
          createBody,
          TEST_COMPLIANCE,
          "COMPLIANCE_ADMIN",
          TEST_TENANT,
          TEST_BRANCH,
        ),
      )
      .send(createBody);
    const policyId = created.body.data.id as string;

    const response = await request(app)
      .post(`/api/v1/policies/${policyId}/approve`)
      .set(
        gatewayHeaders(
          "POST",
          `/api/v1/policies/${policyId}/approve`,
          {},
          TEST_COMPLIANCE,
          "COMPLIANCE_ADMIN",
          TEST_TENANT,
          TEST_BRANCH,
        ),
      )
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ERR_SOD_VIOLATION");
  });

  it("memverifikasi audit chain dan menolak update audit", async () => {
    const response = await request(app)
      .get("/api/v1/audit-logs/verify")
      .set(
        gatewayHeaders(
          "GET",
          "/api/v1/audit-logs/verify",
          undefined,
          SAU_COMPLIANCE,
          "COMPLIANCE_ADMIN",
          SAU_TENANT,
          SAU_BRANCH,
        ),
      );
    expect(response.status).toBe(200);
    expect(response.body.data.valid).toBe(true);

    await expect(
      pool.query("update governance.audit_logs set action = 'TAMPERED' where id = 1"),
    ).rejects.toThrow(/SECURITY_VIOLATION/);
  });

  it("mengisolasi tenant pada level RLS", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE aletheia_app");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [SAU_TENANT]);
      const sauBranches = await client.query<{ count: string }>(
        "select count(*)::text as count from governance.branches",
      );
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        "019361a2-7c00-7000-8000-000000000002",
      ]);
      const bpuiClaims = await client.query<{ count: string }>(
        "select count(*)::text as count from claims.submissions",
      );
      await client.query("ROLLBACK");
      expect(sauBranches.rows[0]?.count).toBe("3");
      expect(bpuiClaims.rows[0]?.count).toBe("0");
    } finally {
      client.release();
    }
  });

  it("mengaktifkan MFA untuk user uji", async () => {
    const enroll = await request(app)
      .post("/api/v1/auth/mfa/enroll")
      .set(
        gatewayHeaders(
          "POST",
          "/api/v1/auth/mfa/enroll",
          {},
          TEST_COMPLIANCE,
          "COMPLIANCE_ADMIN",
          TEST_TENANT,
          TEST_BRANCH,
        ),
      )
      .send({});
    expect(enroll.status).toBe(200);
    const secret = enroll.body.data.secret as string;

    const verify = await request(app)
      .post("/api/v1/auth/mfa/verify")
      .set(
        gatewayHeaders(
          "POST",
          "/api/v1/auth/mfa/verify",
          { code: generateTotpForTest(secret) },
          TEST_COMPLIANCE,
          "COMPLIANCE_ADMIN",
          TEST_TENANT,
          TEST_BRANCH,
        ),
      )
      .send({ code: generateTotpForTest(secret) });
    expect(verify.status).toBe(200);
    expect(verify.body.data.enabled).toBe(true);

    const credentials = { email: "compliance@m21.test", password: "TestPassword!123" };
    const withoutCode = await request(app)
      .post("/api/v1/auth/login")
      .set(publicHeaders("POST", "/api/v1/auth/login", credentials))
      .send(credentials);
    expect(withoutCode.status).toBe(401);
    expect(withoutCode.body.error.message).toMatch(/MFA/);

    const loginCode = generateTotpForTest(secret);
    const withCode = await request(app)
      .post("/api/v1/auth/login")
      .set(
        publicHeaders("POST", "/api/v1/auth/login", {
          ...credentials,
          mfa_code: loginCode,
        }),
      )
      .send({ ...credentials, mfa_code: loginCode });
    expect(withCode.status).toBe(200);
    expect(withCode.body.data.access_token).toBeTypeOf("string");
  });

  it("menyajikan KPI bercache, tren, dan menerima simulasi What-If", async () => {
    const mis = "019361a2-7c00-7000-8000-000000000024";
    const branch = "019361a2-7c00-7000-8000-000000000011";
    const summaryPath = `/internal/v1/analytics/mis-summary?report_month=2026-11&branch_id=${branch}`;
    const started = Date.now();
    const first = await request(app)
      .get(summaryPath)
      .set(
        gatewayHeaders(
          "GET",
          summaryPath.split("?")[0]!,
          undefined,
          mis,
          "MIS_ANALYST",
          SAU_TENANT,
          SAU_BRANCH,
        ),
      );
    const firstDuration = Date.now() - started;
    expect(first.status).toBe(200);
    expect(first.headers["x-cache"]).toBe("MISS");
    expect(first.body.data.items.length).toBeGreaterThan(0);
    expect(firstDuration).toBeLessThan(500);

    const cachedStarted = Date.now();
    const second = await request(app)
      .get(summaryPath)
      .set(
        gatewayHeaders(
          "GET",
          summaryPath.split("?")[0]!,
          undefined,
          mis,
          "MIS_ANALYST",
          SAU_TENANT,
          SAU_BRANCH,
        ),
      );
    const cachedDuration = Date.now() - cachedStarted;
    expect(second.status).toBe(200);
    expect(second.headers["x-cache"]).toBe("HIT");
    expect(cachedDuration).toBeLessThan(500);

    const trendPath = `/internal/v1/analytics/mis-trend?report_month=2026-11&months=6&branch_id=${branch}`;
    const trend = await request(app)
      .get(trendPath)
      .set(
        gatewayHeaders(
          "GET",
          trendPath.split("?")[0]!,
          undefined,
          mis,
          "MIS_ANALYST",
          SAU_TENANT,
          SAU_BRANCH,
        ),
      );
    expect(trend.status).toBe(200);
    expect(trend.body.data.items.length).toBeGreaterThan(0);

    const whatIfBody = {
      simulation_name: "Simulasi kenaikan komisi",
      base_policy_version_id: "019361a2-7c00-7000-8000-000000000102",
      simulated_rules_payload: {
        agent_commission_tiers: [
          { min_sales: "0.00", max_sales: "999999999999.00", commission_rate: "0.0600" },
        ],
      },
      target_period_start: "2026-11-01",
      target_period_end: "2026-11-30",
      branch_id: branch,
    };
    const whatIfPath = "/internal/v1/analytics/what-if";
    const whatIf = await request(app)
      .post(whatIfPath)
      .set(
        gatewayHeaders("POST", whatIfPath, whatIfBody, mis, "MIS_ANALYST", SAU_TENANT, SAU_BRANCH),
      )
      .send(whatIfBody);
    expect(whatIf.status).toBe(202);
    expect(whatIf.body.data.status).toBe("QUEUED");
    expect(whatIf.body.data.enqueued).toBe(false);
    expect(whatIf.body.data.event_id).toMatch(/^[0-9a-f-]{36}$/);

    const invalidatePath = "/internal/v1/analytics/cache/invalidate";
    const invalidated = await request(app)
      .post(invalidatePath)
      .set(gatewayHeaders("POST", invalidatePath, {}, mis, "MIS_ANALYST", SAU_TENANT, SAU_BRANCH))
      .send({});
    expect(invalidated.status).toBe(200);
    expect(invalidated.body.data.invalidated).toBeGreaterThan(0);
  });
});
