import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(HERE, "../../../docs/evidence/m6.3");
const DEMO_PERIOD = "2026-11";
const SEEDED_PAYSLIP_CODE = "SLP-202611-001";
const SEEDED_REPORT_ID = "019361a2-7c00-7000-8000-000000000430";
const SEEDED_POLICY_ID = "019361a2-7c00-7000-8000-000000000102";
const DEMO_PDF = readFileSync(
  resolve(HERE, "../../../packages/database/fixtures/demo-payslip.pdf"),
);
const DEMO_CSV = [
  "personnel_code,name,gross,employee_bpjs,pph21,net",
  "EMP-BDG-001,Siti Aminah,11000000.00,430423.00,220000.00,10349577.00",
  "EMP-BDG-002,Budi Santoso,8000000.00,320000.00,100000.00,7580000.00",
  "AGT-BDG-001,Agus Setiawan,12000000.00,0.00,420000.00,11580000.00",
  "",
].join("\n");
mkdirSync(EVIDENCE, { recursive: true });

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function login(page: Page, roleLabel: string, heading: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(roleLabel) }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

async function accessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

function reportFixture(input: {
  id: string;
  status: "QUEUED" | "GENERATING" | "READY" | "FAILED";
  error_message?: string | null;
}): Record<string, unknown> {
  return {
    id: input.id,
    report_type: "PPH21_MONTHLY",
    branch_id: null,
    policy_version_id: SEEDED_POLICY_ID,
    period_start: "2026-11-01",
    period_end: "2026-11-30",
    version: 1,
    status: input.status,
    file_url: input.status === "READY" ? "/demo/report.csv" : null,
    snapshot_hash_sha256: input.status === "READY" ? "a".repeat(64) : null,
    file_checksum_sha256: input.status === "READY" ? "b".repeat(64) : null,
    total_gross: "0.00",
    total_employee_bpjs: "0.00",
    total_employer_bpjs: "0.00",
    total_pph21: "0.00",
    total_net: "0.00",
    headcount: 0,
    reconciliation_delta: "0.00",
    totals: {},
    generated_by: null,
    generated_at: null,
    error_message: input.error_message ?? null,
    supersedes_id: null,
  };
}

function dataEnvelope(data: unknown): string {
  return JSON.stringify({
    success: true,
    correlation_id: "e2e-test",
    data,
    error: null,
  });
}

test("HR sees the payslip center and downloads the seeded payslip", async ({ page }) => {
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.getByRole("link", { name: "Slip Gaji" }).click();
  await expect(page.getByRole("heading", { name: "Slip Gaji" })).toBeVisible();
  await page.getByLabel("Periode").fill(DEMO_PERIOD);
  await expect(page.getByRole("table")).toBeVisible();

  const row = page.getByTestId(`payslip-row-${SEEDED_PAYSLIP_CODE}`);
  await expect(row).toHaveCount(1);
  await expect(row).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/payslips.png`, fullPage: true });

  const download = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/payslips/") &&
      response.url().endsWith("/download") &&
      response.request().method() === "GET",
  );
  await row.getByRole("button", { name: /Unduh slip/ }).click();
  const response = await download;
  expect(response.status()).toBe(200);
  const envelope = (await response.json()) as {
    data: { url: string; checksum: string };
  };
  expect(envelope.data.checksum).toBe(sha256(DEMO_PDF));

  const file = await page.request.get(
    new URL(envelope.data.url, "http://localhost:5173").toString(),
  );
  expect(file.status()).toBe(200);
  expect(Buffer.from(await file.body()).equals(DEMO_PDF)).toBe(true);
  await expect(page.getByText(/Tautan unduhan dibuka/)).toBeVisible();
});

test("HR sees the reports page and downloads the seeded PPh 21 report", async ({ page }) => {
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.getByRole("link", { name: "Laporan dan Ekspor" }).click();
  await expect(page.getByRole("heading", { name: "Laporan dan Ekspor" })).toBeVisible();
  await page.getByLabel("Periode").fill(DEMO_PERIOD);
  await expect(page.getByRole("table")).toBeVisible();

  const row = page.getByTestId(`report-row-${SEEDED_REPORT_ID}`);
  await expect(row).toHaveCount(1);
  await expect(row).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/reports.png`, fullPage: true });

  const download = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/reports/") &&
      response.url().endsWith("/download") &&
      response.request().method() === "GET",
  );
  await row.getByRole("button", { name: /Unduh PPh 21 bulanan/ }).click();
  const response = await download;
  expect(response.status()).toBe(200);
  const envelope = (await response.json()) as {
    data: { url: string; checksum: string };
  };
  expect(envelope.data.checksum).toBe(sha256(DEMO_CSV));

  const file = await page.request.get(
    new URL(envelope.data.url, "http://localhost:5173").toString(),
  );
  expect(file.status()).toBe(200);
  expect(await file.text()).toBe(DEMO_CSV);
  await expect(page.getByText(/Tautan unduhan dibuka/)).toBeVisible();
});

test("reports page handles queued, generating, failed, and empty states", async ({ page }) => {
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.route("**/api/v1/reports?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("report_type") === "PAYROLL_VARIANCE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: dataEnvelope({ items: [], meta: { next_cursor: null, has_more: false } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: dataEnvelope({
        items: [
          reportFixture({ id: "019361a2-7c00-7000-8000-000000000901", status: "QUEUED" }),
          reportFixture({ id: "019361a2-7c00-7000-8000-000000000902", status: "GENERATING" }),
          reportFixture({
            id: "019361a2-7c00-7000-8000-000000000903",
            status: "FAILED",
            error_message: "SQLSTATE 42P01 internal detail",
          }),
        ],
        meta: { next_cursor: null, has_more: false },
      }),
    });
  });

  await page.getByRole("link", { name: "Laporan dan Ekspor" }).click();
  await expect(page.getByRole("heading", { name: "Laporan dan Ekspor" })).toBeVisible();
  await expect(page.getByText("Dalam antrean").first()).toBeVisible();
  await expect(page.getByText("Sedang dibuat").first()).toBeVisible();
  await expect(page.getByText("Gagal").first()).toBeVisible();
  await expect(page.getByText("Sebagian laporan gagal dibuat")).toBeVisible();
  await expect(page.getByText(/SQLSTATE/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Unduh/ }).first()).toBeDisabled();

  await page.getByLabel("Jenis laporan").selectOption("PAYROLL_VARIANCE");
  await expect(page.getByText("Belum ada laporan")).toBeVisible();
});

test("payslip download reports a not-ready file without crashing", async ({ page }) => {
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.route("**/api/v1/payslips/*/download", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        correlation_id: "e2e-test",
        data: null,
        error: {
          code: "ERR_REPORT_NOT_READY",
          message: "Berkas payslip belum tersedia",
          correlation_id: "e2e-test",
        },
      }),
    });
  });
  await page.getByRole("link", { name: "Slip Gaji" }).click();
  await page.getByLabel("Periode").fill(DEMO_PERIOD);
  const row = page.getByTestId(`payslip-row-${SEEDED_PAYSLIP_CODE}`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Unduh slip/ }).click();
  await expect(page.getByText("Berkas belum tersedia")).toBeVisible();
});

test("compliance can read reports but cannot create them", async ({ page }) => {
  await login(page, "Administrator Kepatuhan", "Ruang Klaim");
  await page.getByRole("link", { name: "Laporan dan Ekspor" }).click();
  await expect(page.getByRole("heading", { name: "Laporan dan Ekspor" })).toBeVisible();
  await expect(page.getByText("Mode baca")).toBeVisible();
  await expect(page.getByRole("button", { name: "Buat laporan" })).toHaveCount(0);
  expect(await accessibilityViolations(page)).toEqual([]);
});

test("roles without payroll access cannot open payslips or reports", async ({ page }) => {
  await login(page, "Petugas Klaim", "Ruang Klaim");
  await page.goto("/payslips");
  await expect(page.getByRole("heading", { name: "Akses terbatas" })).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Akses terbatas" })).toBeVisible();
});

test("mobile payslip and reports tables remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("link", { name: "Slip Gaji" }).click();
  await page.getByLabel("Periode").fill(DEMO_PERIOD);
  await expect(page.getByRole("heading", { name: "Slip Gaji" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/payslips-mobile.png`, fullPage: true });

  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("link", { name: "Laporan dan Ekspor" }).click();
  await page.getByLabel("Periode").fill(DEMO_PERIOD);
  await expect(page.getByRole("table")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/reports-mobile.png`, fullPage: true });
});
