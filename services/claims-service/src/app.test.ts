import { createHash, createHmac, randomUUID } from "node:crypto";

import { closeDatabase, pool } from "@aletheia/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { hashBankAccount, hashNik } from "./lib/pii.js";
import { signMockWebhook } from "./lib/payments.js";

const integrationEnabled = process.env.RUN_CLAIMS_INTEGRATION === "true";
const app = createApp();
const gatewaySecret = "test-internal-gateway-secret";

const TENANT = "019361a2-7c00-7000-8000-000000000921";
const BRANCH = "019361a2-7c00-7000-8000-000000000922";
const OFFICER = "019361a2-7c00-7000-8000-000000000923";
const MANAGER = "019361a2-7c00-7000-8000-000000000924";
const FINANCE = "019361a2-7c00-7000-8000-000000000925";
const COMPLIANCE = "019361a2-7c00-7000-8000-000000000926";
const POLICY = "019361a2-7c00-7000-8000-000000000927";
const AGENT = "019361a2-7c00-7000-8000-000000000928";

const INVALID_TENANT = "019361a2-7c00-7000-8000-000000000931";
const INVALID_BRANCH = "019361a2-7c00-7000-8000-000000000932";
const INVALID_OFFICER = "019361a2-7c00-7000-8000-000000000933";
const INVALID_POLICY = "019361a2-7c00-7000-8000-000000000934";
const INVALID_APPROVER = "019361a2-7c00-7000-8000-000000000935";

const RUN_ID = String(Date.now()).slice(-8);
const MAIN_BANK = `55${RUN_ID}1112`;

const SAU_TENANT = "019361a2-7c00-7000-8000-000000000001";
const SAU_BRANCH = "019361a2-7c00-7000-8000-000000000011";
const SAU_OFFICER = "019361a2-7c00-7000-8000-000000000020";

const policies = {
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

interface Identity {
  userId: string;
  role: string;
  branchId: string;
  tenantId: string;
}

const officer: Identity = {
  userId: OFFICER,
  role: "CLAIMS_OFFICER",
  branchId: BRANCH,
  tenantId: TENANT,
};
const manager: Identity = {
  userId: MANAGER,
  role: "BRANCH_MANAGER",
  branchId: BRANCH,
  tenantId: TENANT,
};
const finance: Identity = {
  userId: FINANCE,
  role: "FINANCE_MANAGER",
  branchId: BRANCH,
  tenantId: TENANT,
};
const compliance: Identity = {
  userId: COMPLIANCE,
  role: "COMPLIANCE_ADMIN",
  branchId: BRANCH,
  tenantId: TENANT,
};

function gatewayHeaders(
  method: string,
  path: string,
  body: unknown,
  identity: Identity,
  idempotencyKey?: string,
  secret = gatewaySecret,
): Record<string, string> {
  const bodyText = body === undefined ? "" : JSON.stringify(body);
  const bodyHash = createHash("sha256").update(bodyText).digest("hex");
  const timestamp = String(Date.now());
  const payload = [
    method,
    path,
    bodyHash,
    identity.userId,
    identity.role,
    identity.branchId,
    identity.tenantId,
    timestamp,
  ].join(":");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return {
    "content-type": "application/json",
    "x-user-id": identity.userId,
    "x-user-role": identity.role,
    "x-branch-id": identity.branchId,
    "x-tenant-id": identity.tenantId,
    "x-gateway-timestamp": timestamp,
    "x-request-method": method,
    "x-request-path": path,
    "x-body-sha256": bodyHash,
    "x-gateway-signature": signature,
    "x-correlation-id": randomUUID(),
    ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey }),
  };
}

function publicHeaders(method: string, path: string, body: unknown): Record<string, string> {
  const zero = "00000000-0000-0000-0000-000000000000";
  return gatewayHeaders(
    method,
    path,
    body,
    { userId: zero, role: "PUBLIC", branchId: zero, tenantId: zero },
    undefined,
  );
}

function document(type: string) {
  return {
    document_type: type,
    cloudinary_public_id: `aletheia/test/${type.toLowerCase()}`,
    secure_url: `https://res.cloudinary.com/aletheia-test/image/upload/${type.toLowerCase()}.pdf`,
    mime_type: "application/pdf",
    file_size_bytes: 1024,
  };
}

function healthClaim(overrides: Record<string, unknown> = {}) {
  return {
    claimant_name: "Andi Wijaya",
    claimant_nik: "3273000000000777",
    claimant_bank_account: MAIN_BANK,
    claim_category: "HEALTH",
    requested_amount: "5000000.00",
    documents: [document("IDENTITY_CARD"), document("MEDICAL_INVOICE")],
    ...overrides,
  };
}

async function createClaim(
  identity: Identity,
  body: Record<string, unknown>,
  key: string,
): Promise<request.Response> {
  return request(app)
    .post("/api/v1/claims")
    .set(gatewayHeaders("POST", "/api/v1/claims", body, identity, key))
    .send(body);
}

async function submitClaim(identity: Identity, claimId: string): Promise<request.Response> {
  return request(app)
    .post(`/api/v1/claims/${claimId}/submit`)
    .set(gatewayHeaders("POST", `/api/v1/claims/${claimId}/submit`, {}, identity))
    .send({});
}

async function decideClaim(
  identity: Identity,
  claimId: string,
  body: Record<string, unknown>,
  key: string,
): Promise<request.Response> {
  return request(app)
    .post(`/api/v1/claims/${claimId}/decide`)
    .set(gatewayHeaders("POST", `/api/v1/claims/${claimId}/decide`, body, identity, key))
    .send(body);
}

describe.skipIf(!integrationEnabled)("claims service integration", () => {
  let mainClaimId = "";
  let paymentId = "";

  beforeAll(async () => {
    await pool.query(
      `insert into governance.tenants (id, code, name, status)
       values ($1, 'M22', 'M2.2 Claims Tenant', 'ACTIVE'),
              ($2, 'M22X', 'M2.2 Invalid Policy Tenant', 'ACTIVE')
       on conflict (id) do nothing`,
      [TENANT, INVALID_TENANT],
    );
    await pool.query(
      `insert into governance.branches
        (id, tenant_id, code, name, region, monthly_disbursement_cap)
       values ($1, $2, 'M22-01', 'M2.2 Branch', 'Test', '1000000000.00'),
              ($3, $2, 'M22-02', 'M2.2 Branch Two', 'Test', '1000000000.00'),
              ($4, $5, 'M22X-01', 'M2.2 Invalid Branch', 'Test', '1000000000.00')
       on conflict (id) do nothing`,
      [BRANCH, TENANT, "019361a2-7c00-7000-8000-000000000936", INVALID_BRANCH, INVALID_TENANT],
    );

    const users = [
      [OFFICER, TENANT, BRANCH, "M22-01", "Test Officer", "officer@m22.test", "CLAIMS_OFFICER"],
      [MANAGER, TENANT, BRANCH, "M22-02", "Test Manager", "manager@m22.test", "BRANCH_MANAGER"],
      [FINANCE, TENANT, BRANCH, "M22-03", "Test Finance", "finance@m22.test", "FINANCE_MANAGER"],
      [
        COMPLIANCE,
        TENANT,
        BRANCH,
        "M22-04",
        "Test Compliance",
        "compliance@m22.test",
        "COMPLIANCE_ADMIN",
      ],
      [
        INVALID_OFFICER,
        INVALID_TENANT,
        INVALID_BRANCH,
        "M22X-01",
        "Invalid Officer",
        "officer@m22x.test",
        "CLAIMS_OFFICER",
      ],
      [
        INVALID_APPROVER,
        INVALID_TENANT,
        INVALID_BRANCH,
        "M22X-02",
        "Invalid Approver",
        "approver@m22x.test",
        "BRANCH_MANAGER",
      ],
    ] as const;

    for (const [id, tenantId, branchId, employeeNumber, fullName, email, role] of users) {
      await pool.query(
        `insert into governance.users
          (id, tenant_id, branch_id, employee_number, full_name, email, password_hash, role, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true)
         on conflict (id) do nothing`,
        [id, tenantId, branchId, employeeNumber, fullName, email, "x".repeat(64), role],
      );
    }

    await pool.query(
      `update governance.policy_versions
          set status = 'ARCHIVED'
        where tenant_id = $1
          and domain = 'CLAIMS_POLICY'
          and status = 'ACTIVE'
          and id <> $2`,
      [TENANT, POLICY],
    );
    await pool.query(
      `insert into governance.policy_versions
        (id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
         effective_from, published_by, approved_by)
       values ($1,$2,'CLAIMS_POLICY','v2026.11.01','ACTIVE',$3,$4,'2026-11-01T00:00:00.000Z',$5,$6)
       on conflict (tenant_id, domain, version_tag) do update
         set status = 'ACTIVE',
             rules_payload = excluded.rules_payload,
             approved_by = excluded.approved_by,
             published_by = excluded.published_by`,
      [
        POLICY,
        TENANT,
        policies,
        createHash("sha256").update("m22-policy").digest("hex"),
        OFFICER,
        MANAGER,
      ],
    );

    await pool.query(
      `insert into governance.policy_versions
        (id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
         effective_from, published_by, approved_by)
       values ($1,$2,'CLAIMS_POLICY','v2026.11.incomplete','ACTIVE',$3,$4,'2026-11-01T00:00:00.000Z',$5,$6)
       on conflict (tenant_id, domain, version_tag) do nothing`,
      [
        INVALID_POLICY,
        INVALID_TENANT,
        { approval_tiers: {} },
        createHash("sha256").update("m22-invalid-policy").digest("hex"),
        INVALID_OFFICER,
        INVALID_APPROVER,
      ],
    );

    await pool.query(
      `insert into payroll.personnel
        (id, tenant_id, branch_id, personnel_code, personnel_type, full_name, nik_hash,
         nik_masked, bank_account_hash, bank_account_masked, bank_code, bank_name,
         ptkp_status, risk_class, employment_status, base_salary, fixed_allowance, join_date)
       values ($1,$2,$3,'AGT-M22-001','SALES_AGENT','Agent Konflik',$4,'3273********0778',
               $5,'******1112','BCA','Bank Central Asia','TK/0','I','CONTRACT','0.00','0.00','2026-01-01')
       on conflict (id) do update
         set bank_account_hash = excluded.bank_account_hash,
             nik_hash = excluded.nik_hash`,
      [AGENT, TENANT, BRANCH, hashNik("3273000000000778"), hashBankAccount("7770001112")],
    );
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("menolak request tanpa atau dengan signature gateway salah", async () => {
    const missing = await request(app).get("/api/v1/claims");
    expect(missing.status).toBe(401);

    const path = "/api/v1/claims";
    const forged = await request(app)
      .get(path)
      .set(gatewayHeaders("GET", path, undefined, officer, undefined, "wrong-secret"));
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe("ERR_UNAUTHORIZED_ACCESS");
  });

  it("menghasilkan signature upload Cloudinary untuk folder tenant", async () => {
    const body = {
      document_type: "IDENTITY_CARD",
      file_name: "identitas.pdf",
      mime_type: "application/pdf",
      file_size_bytes: 1000,
    };
    const path = "/api/v1/claims/upload-signature";
    const response = await request(app)
      .post(path)
      .set(gatewayHeaders("POST", path, body, officer))
      .send(body);
    expect(response.status).toBe(200);
    expect(response.body.data.folder).toContain(TENANT);
    expect(response.body.data.signature).toMatch(/^[a-f0-9]{40}$/);
    expect(response.body.data.max_file_size).toBe(5 * 1024 * 1024);
  });

  it("menolak policy yang kehilangan kunci wajib dengan 422", async () => {
    const body = healthClaim();
    const response = await createClaim(
      {
        userId: INVALID_OFFICER,
        role: "CLAIMS_OFFICER",
        branchId: INVALID_BRANCH,
        tenantId: INVALID_TENANT,
      },
      body,
      `invalid-policy-${randomUUID()}`,
    );
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("ERR_POLICY_RULE_VIOLATION");
  });

  it("membuat draf, masking PII, dan replay idempotensi", async () => {
    const body = healthClaim();
    const key = `create-${randomUUID()}`;
    const created = await createClaim(officer, body, key);
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("DRAFT");
    expect(created.body.data.claimant_nik_masked).toBe("3273********0777");
    expect(created.body.data.bank_account_masked).toBe("******1112");
    expect(created.body.data.policy_version_id).toBe(POLICY);
    expect(JSON.stringify(created.body)).not.toContain("3273000000000777");
    expect(JSON.stringify(created.body)).not.toContain(MAIN_BANK);
    mainClaimId = created.body.data.id as string;

    const replay = await createClaim(officer, body, key);
    expect(replay.status).toBe(200);
    expect(replay.headers["x-idempotent-replay"]).toBe("true");
    expect(replay.body.data.id).toBe(mainClaimId);

    const conflict = await createClaim(
      officer,
      healthClaim({ requested_amount: "6000000.00" }),
      key,
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("ERR_IDEMPOTENCY_CONFLICT");

    const patchPath = `/api/v1/claims/${mainClaimId}`;
    const patched = await request(app)
      .patch(patchPath)
      .set(gatewayHeaders("PATCH", patchPath, { claimant_name: "Andi Wijaya Revisi" }, officer))
      .send({ claimant_name: "Andi Wijaya Revisi" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.claimant_name).toBe("Andi Wijaya Revisi");
    expect(patched.body.data.status).toBe("DRAFT");
  });

  it("menolak submit bila dokumen wajib belum lengkap", async () => {
    const body = healthClaim({ documents: [document("IDENTITY_CARD")] });
    const created = await createClaim(officer, body, `incomplete-${randomUUID()}`);
    expect(created.status).toBe(201);
    const submitted = await submitClaim(officer, created.body.data.id as string);
    expect(submitted.status).toBe(422);
    expect(submitted.body.error.code).toBe("ERR_POLICY_RULE_VIOLATION");
    expect(submitted.body.error.message).toMatch(/MEDICAL_INVOICE/);
  });

  it("submit mengevaluasi risiko dan mengikat policy", async () => {
    const submitted = await submitClaim(officer, mainClaimId);
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe("UNDER_REVIEW");
    expect(submitted.body.data.risk_evaluated_at).toBeTypeOf("string");
    expect(submitted.body.data.risk_score).toBeGreaterThanOrEqual(0);
    expect(submitted.body.data.bound_policy_rules.sla_target_hours).toBe(48);
  });

  it("menolak maker yang menyetujui klaim sendiri dengan ERR_SOD_VIOLATION", async () => {
    const response = await decideClaim(
      officer,
      mainClaimId,
      {
        decision: "APPROVED",
        approved_amount: "5000000.00",
        reason_notes: "Dokumen lengkap dan sesuai kebijakan",
      },
      `sod-${randomUUID()}`,
    );
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ERR_SOD_VIOLATION");
  });

  it("hanya satu keputusan paralel yang berhasil", async () => {
    const body = {
      decision: "APPROVED",
      approved_amount: "5000000.00",
      reason_notes: "Dokumen lengkap dan sesuai kebijakan",
    };
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        decideClaim(manager, mainClaimId, body, `parallel-${randomUUID()}`),
      ),
    );
    const successes = responses.filter((response) => response.status === 200);
    const conflicts = responses.filter((response) => response.status === 409);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(4);
    expect(successes[0]?.body.data.status).toBe("APPROVED");
  });

  it("mencairkan sekali, menolak pencairan kedua, dan memproses webhook", async () => {
    const body = { provider: "MOCK" };
    const key = `disburse-${randomUUID()}`;
    const path = `/api/v1/claims/${mainClaimId}/disburse`;
    const first = await request(app)
      .post(path)
      .set(gatewayHeaders("POST", path, body, finance, key))
      .send(body);
    expect(first.status).toBe(202);
    expect(first.body.data.status).toBe("PROCESSING");
    paymentId = first.body.data.id as string;

    const second = await request(app)
      .post(path)
      .set(gatewayHeaders("POST", path, body, finance, `disburse-${randomUUID()}`))
      .send(body);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ERR_PAYMENT_STATE_CONFLICT");

    const event = {
      event_id: `evt-${randomUUID()}`,
      event_type: "PAYMENT_PAID",
      provider: "MOCK",
      provider_reference: first.body.data.provider_reference as string,
      status: "PAID",
      amount: "5000000.00",
      occurred_at: new Date().toISOString(),
      payload: { source: "integration-test" },
    };
    const webhookBody = { signature: signMockWebhook(event), body: event };
    const webhookPath = "/api/v1/claims/payments/webhook/MOCK";
    const webhook = await request(app)
      .post(webhookPath)
      .set(publicHeaders("POST", webhookPath, webhookBody))
      .send(webhookBody);
    expect(webhook.status).toBe(200);
    expect(webhook.body.data.received).toBe(true);

    const detailPath = `/api/v1/claims/${mainClaimId}`;
    const detail = await request(app)
      .get(detailPath)
      .set(gatewayHeaders("GET", detailPath, undefined, officer));
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe("DISBURSED");

    const paymentPath = `/api/v1/claims/payments/${paymentId}`;
    const payment = await request(app)
      .get(paymentPath)
      .set(gatewayHeaders("GET", paymentPath, undefined, finance));
    expect(payment.status).toBe(200);
    expect(payment.body.data.status).toBe("PAID");
  });

  it("mendeteksi konflik lintas domain dan menegakkan review kepatuhan", async () => {
    const body = {
      claimant_name: "Rizky Pratama",
      claimant_nik: "3273000000000778",
      claimant_bank_account: "7770001112",
      claim_category: "ACCIDENT",
      requested_amount: "18500000.00",
      documents: [
        document("IDENTITY_CARD"),
        document("MEDICAL_INVOICE"),
        document("POLICE_REPORT"),
      ],
    };
    const created = await createClaim(officer, body, `conflict-${randomUUID()}`);
    expect(created.status).toBe(201);
    const claimId = created.body.data.id as string;

    const submitted = await submitClaim(officer, claimId);
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe("COMPLIANCE_REVIEW");
    expect(submitted.body.data.has_conflict_flag).toBe(true);
    expect(
      submitted.body.data.anomaly_flags.map(
        (flag: { conflict_type: string }) => flag.conflict_type,
      ),
    ).toContain("SHARED_BANK_ACCOUNT");

    const blocked = await decideClaim(
      finance,
      claimId,
      {
        decision: "APPROVED",
        approved_amount: "18500000.00",
        reason_notes: "Dokumen lengkap dan sesuai kebijakan",
      },
      `conflict-decide-${randomUUID()}`,
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("ERR_COMPLIANCE_REVIEW_PENDING");

    const reviewBody = {
      resolution: "FALSE_POSITIVE",
      reason_notes: "Rekening nasabah valid dan bukan milik agen",
    };
    const reviewPath = `/api/v1/claims/${claimId}/compliance-review`;
    const review = await request(app)
      .post(reviewPath)
      .set(gatewayHeaders("POST", reviewPath, reviewBody, compliance))
      .send(reviewBody);
    expect(review.status).toBe(200);
    expect(review.body.data.status).toBe("ESCALATED");

    const managerDecision = await decideClaim(
      manager,
      claimId,
      {
        decision: "APPROVED",
        approved_amount: "18500000.00",
        reason_notes: "Dokumen lengkap dan sesuai kebijakan",
      },
      `conflict-manager-${randomUUID()}`,
    );
    expect(managerDecision.status).toBe(403);

    const approved = await decideClaim(
      finance,
      claimId,
      {
        decision: "APPROVED",
        approved_amount: "18500000.00",
        reason_notes: "Dokumen lengkap dan sesuai kebijakan",
      },
      `conflict-finance-${randomUUID()}`,
    );
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("APPROVED");
  });

  it("menyembunyikan klaim lintas tenant dan lintas cabang", async () => {
    const path = `/api/v1/claims/${mainClaimId}`;
    const crossTenant = await request(app)
      .get(path)
      .set(
        gatewayHeaders("GET", path, undefined, {
          userId: SAU_OFFICER,
          role: "CLAIMS_OFFICER",
          branchId: SAU_BRANCH,
          tenantId: SAU_TENANT,
        }),
      );
    expect(crossTenant.status).toBe(404);

    const crossBranch = await request(app)
      .get(path)
      .set(
        gatewayHeaders("GET", path, undefined, {
          userId: MANAGER,
          role: "BRANCH_MANAGER",
          branchId: "019361a2-7c00-7000-8000-000000000936",
          tenantId: TENANT,
        }),
      );
    expect(crossBranch.status).toBe(404);
  });
});
