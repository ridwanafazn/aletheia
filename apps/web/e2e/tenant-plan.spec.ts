import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(HERE, "../../../docs/evidence/m6.6");
const SEEDED_COST_REPORT_ID = "019361a2-7c00-7000-8000-000000000431";
const DEMO_PERIOD = "2026-11";
const DEMO_COST_CSV = [
  "# report_type PAYROLL_COST_INVOICE",
  "# period_start 2026-11-01",
  "# period_end 2026-11-30",
  "# policy v2026.11.cost",
  "# bjo_rate 0.0250",
  "# management_fee_rate 0.0500",
  "# invoice_rounding UP_1000",
  "branch_code,branch_name,headcount,gross,employer_bpjs,bjo,management_fee,total_invoice",
  "BDG-01,Bandung,3,31000000.00,1926446.00,775000.00,1685072.30,35387000.00",
  "",
].join("\n");
mkdirSync(EVIDENCE, { recursive: true });

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function login(page: Page, roleLabel: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(roleLabel) }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Konsol Payroll" })).toBeVisible();
}

async function accessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

test("tenant plan is visible and the cost invoice report can be downloaded", async ({ page }) => {
  await login(page, "Spesialis SDM");
  await expect(page.getByText("HRIS Pro", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Laporan dan Ekspor" }).click();
  await expect(page.getByRole("heading", { name: "Laporan dan Ekspor" })).toBeVisible();
  await page.getByLabel("Jenis laporan").selectOption("PAYROLL_COST_INVOICE");
  await page.getByLabel("Periode").fill(DEMO_PERIOD);
  await expect(page.getByRole("table")).toBeVisible();

  const row = page.getByTestId(`report-row-${SEEDED_COST_REPORT_ID}`);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Invoice biaya payroll");
  await expect(row).toContainText("Siap");
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/reports-cost-invoice.png`, fullPage: true });

  const download = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/reports/") &&
      response.url().endsWith("/download") &&
      response.request().method() === "GET",
  );
  await row.getByRole("button", { name: /Unduh Invoice biaya payroll/ }).click();
  const response = await download;
  expect(response.status()).toBe(200);
  const envelope = (await response.json()) as {
    data: { url: string; checksum: string };
  };
  expect(envelope.data.checksum).toBe(sha256(DEMO_COST_CSV));

  const file = await page.request.get(
    new URL(envelope.data.url, "http://localhost:5173").toString(),
  );
  expect(file.status()).toBe(200);
  expect(await file.text()).toBe(DEMO_COST_CSV);
});
