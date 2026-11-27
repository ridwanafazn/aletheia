import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "AletheiaDemo!2026";
const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:8787";
const WORKER_URL = process.env.WORKER_URL ?? "http://127.0.0.1:4004";
const FULL = process.env.RUN_FULL_E2E === "1";
const SAU_TENANT = "019361a2-7c00-7000-8000-000000000001";
const SAU_BRANCH_BDG = "019361a2-7c00-7000-8000-000000000011";

interface Session {
  token: string;
  userId: string;
}

async function apiLogin(request: APIRequestContext, email: string): Promise<Session> {
  const response = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    data: { access_token: string; user: { id: string } };
  };
  return { token: body.data.access_token, userId: body.data.user.id };
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function createSubmittedClaim(
  request: APIRequestContext,
  token: string,
  amount: string,
  suffix: string,
): Promise<{ id: string; claimNumber: string }> {
  const body = {
    claimant_name: `E2E Final QA ${suffix}`,
    claimant_nik: `3273${suffix.padStart(12, "0").slice(-12)}`,
    claimant_bank_account: `8800${suffix.padStart(12, "0").slice(-12)}`,
    claim_category: "HEALTH",
    requested_amount: amount,
    documents: [
      {
        document_type: "IDENTITY_CARD",
        cloudinary_public_id: `aletheia/e2e/identity-${suffix}`,
        secure_url: `https://res.cloudinary.com/aletheia-demo/image/upload/identity-${suffix}.pdf`,
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      },
      {
        document_type: "MEDICAL_INVOICE",
        cloudinary_public_id: `aletheia/e2e/invoice-${suffix}`,
        secure_url: `https://res.cloudinary.com/aletheia-demo/image/upload/invoice-${suffix}.pdf`,
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      },
    ],
  };
  const created = await request.post(`${API_URL}/api/v1/claims`, {
    headers: { ...authHeaders(token), "idempotency-key": `e2e-final-${suffix}` },
    data: body,
  });
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as {
    data: { id: string; claim_number: string };
  };
  const submitted = await request.post(`${API_URL}/api/v1/claims/${createdBody.data.id}/submit`, {
    headers: authHeaders(token),
    data: {},
  });
  expect(submitted.status()).toBe(200);
  return { id: createdBody.data.id, claimNumber: createdBody.data.claim_number };
}

async function loginUi(page: Page, roleLabel: string, heading: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(roleLabel) }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

async function logoutUi(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

test("enam peran seed dapat login dan logout", async ({ page }) => {
  const roles: Array<[string, string]> = [
    ["Petugas Klaim", "Ruang Klaim"],
    ["Manajer Cabang", "Ruang Klaim"],
    ["Manajer Keuangan", "Ruang Klaim"],
    ["Spesialis SDM", "Konsol Payroll"],
    ["Administrator Kepatuhan", "Ruang Klaim"],
    ["Analis MIS", "MIS Intelligence"],
  ];

  for (const [role, heading] of roles) {
    await loginUi(page, role, heading);
    await expect(page.getByRole("button", { name: "Keluar" })).toBeVisible();
    await logoutUi(page);
  }
});

test("maker tidak melihat dan tidak dapat memakai aksi approve", async ({ request, page }) => {
  const officer = await apiLogin(request, "officer.bdg@aletheia.id");
  const suffix = String(Date.now()).slice(-10);
  const claim = await createSubmittedClaim(request, officer.token, "1000000.00", suffix);

  await loginUi(page, "Petugas Klaim", "Ruang Klaim");
  await page.goto(`/claims/${claim.id}`);
  await expect(page.getByRole("heading", { name: "Detail Klaim" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ambil keputusan" })).toHaveCount(0);

  const direct = await request.post(`${API_URL}/api/v1/claims/${claim.id}/decide`, {
    headers: { ...authHeaders(officer.token), "idempotency-key": `e2e-sod-${suffix}` },
    data: {
      decision: "APPROVED",
      approved_amount: "1000000.00",
      reason_notes: "Percobaan pelanggaran SoD",
    },
  });
  expect(direct.status()).toBe(403);
  const body = (await direct.json()) as { error: { code: string } };
  expect(body.error.code).toBe("ERR_SOD_VIOLATION");
});

test("klaim level 2 dieskalasi dan disetujui finance", async ({ request, page }) => {
  const officer = await apiLogin(request, "officer.bdg@aletheia.id");
  const suffix = String(Date.now()).slice(-10);
  const claim = await createSubmittedClaim(request, officer.token, "30000000.00", suffix);

  await loginUi(page, "Manajer Keuangan", "Ruang Klaim");
  await page.goto(`/claims/${claim.id}`);
  await expect(page.getByRole("heading", { name: "Detail Klaim" })).toBeVisible();
  await page.getByRole("button", { name: "Ambil keputusan" }).click();
  await page.getByLabel(/Alasan/).fill("Nominal melebihi kewenangan cabang, disetujui finance");
  await page.getByRole("button", { name: "Setujui klaim" }).click();
  await expect(page.getByText(/berstatus Disetujui/)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("keyboard dapat membuka detail batch dan menutup breakdown", async ({ page }) => {
  await loginUi(page, "Spesialis SDM", "Konsol Payroll");
  await expect(page.getByRole("table")).toBeVisible();

  const firstBatch = page
    .locator(".payroll-table tbody tr")
    .filter({ hasText: "BDG-01" })
    .first()
    .getByRole("button")
    .first();
  await firstBatch.focus();
  await expect(firstBatch).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Detail Batch Payroll" })).toBeVisible();

  const firstEmployee = page
    .locator(".payroll-items-table tbody tr")
    .first()
    .getByRole("button")
    .first();
  await firstEmployee.focus();
  await expect(firstEmployee).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Net diterima")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Net diterima")).not.toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("HR menghitung batch koreksi dan finance menyetujui serta mencairkan", async ({
  request,
  page,
}) => {
  test.skip(!FULL, "Set RUN_FULL_E2E=1 untuk alur kalkulasi dan pencairan payroll live");
  test.setTimeout(180_000);

  const hr = await apiLogin(request, "hr.ops@aletheia.id");
  const list = await request.get(
    `${API_URL}/api/v1/payroll/batches?period_month=2027-01-01&limit=100`,
    { headers: authHeaders(hr.token) },
  );
  const listBody = (await list.json()) as {
    data: { items: Array<{ batch_type: string; correction_seq: number }> };
  };
  const nextCorrection =
    Math.max(
      0,
      ...listBody.data.items
        .filter((item) => item.batch_type === "CORRECTION")
        .map((item) => item.correction_seq),
    ) + 1;

  const created = await request.post(`${API_URL}/api/v1/payroll/batches`, {
    headers: {
      ...authHeaders(hr.token),
      "idempotency-key": `e2e-payroll-${Date.now()}`.slice(0, 64),
    },
    data: {
      branch_id: SAU_BRANCH_BDG,
      period_month: "2027-01-01",
      batch_type: "CORRECTION",
      correction_seq: nextCorrection,
      period_start: "2027-01-01",
      period_end: "2027-01-31",
    },
  });
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as {
    data: { batch: { id: string; batch_code: string; policy_version_id: string } };
  };
  const batch = createdBody.data.batch;

  const calculated = await request.post(`${API_URL}/api/v1/payroll/batches/${batch.id}/calculate`, {
    headers: authHeaders(hr.token),
    data: {},
  });
  expect(calculated.status()).toBe(202);

  const worker = await request.post(`${WORKER_URL}/internal/v1/qstash/consume`, {
    headers: { "content-type": "application/json" },
    data: {
      event_id: crypto.randomUUID(),
      event_type: "PAYROLL_BATCH_CALCULATE",
      tenant_id: SAU_TENANT,
      correlation_id: crypto.randomUUID(),
      requested_by: hr.userId,
      requested_at: new Date().toISOString(),
      batch_id: batch.id,
      policy_version_id: batch.policy_version_id,
      branch_id: SAU_BRANCH_BDG,
      period_start: "2027-01-01",
      period_end: "2027-01-31",
    },
  });
  expect(worker.status()).toBe(200);

  await expect
    .poll(
      async () => {
        const response = await request.get(`${API_URL}/api/v1/payroll/batches/${batch.id}`, {
          headers: authHeaders(hr.token),
        });
        const body = (await response.json()) as {
          data: { batch: { status: string; headcount: number } };
        };
        return body.data.batch.status;
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe("READY_FOR_APPROVAL");

  await loginUi(page, "Manajer Keuangan", "Ruang Klaim");
  await page.goto(`/payroll/${batch.id}`);
  await expect(page.getByRole("heading", { name: "Detail Batch Payroll" })).toBeVisible();
  await page.getByRole("button", { name: "Setujui batch" }).click();
  await page.getByLabel("Catatan persetujuan").fill("E2E final QA: komponen payroll diperiksa");
  await page.getByRole("button", { name: "Setujui batch", exact: true }).last().click();
  await expect(page.getByText(/Batch disetujui/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Cairkan batch" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "Cairkan batch" }).click();
  await expect(page.getByText(/Total pencairan/)).toBeVisible();
  await page.getByRole("button", { name: "Kirim pencairan" }).click();
  await expect(page.getByText(/Pencairan selesai/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Sudah dicairkan", { exact: true }).first()).toBeVisible();
});
