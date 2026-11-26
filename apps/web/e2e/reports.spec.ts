import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(HERE, "../../../docs/evidence/m6.3");
mkdirSync(EVIDENCE, { recursive: true });

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

test("HR sees the payslip center and downloads a seeded payslip", async ({ page }) => {
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.getByRole("link", { name: "Slip Gaji" }).click();
  await expect(page.getByRole("heading", { name: "Slip Gaji" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  const payslipRow = page.getByRole("row").filter({ hasText: "Siti Aminah" }).first();
  await expect(payslipRow).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/payslips.png`, fullPage: true });

  const download = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/payslips/") &&
      response.url().endsWith("/download") &&
      response.request().method() === "GET",
  );
  await payslipRow.getByRole("button", { name: /Unduh slip/ }).click();
  expect((await download).status()).toBe(200);
  await expect(page.getByText(/Tautan unduhan dibuka/)).toBeVisible();
});

test("HR sees the reports page and downloads the seeded PPh 21 report", async ({ page }) => {
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.getByRole("link", { name: "Laporan dan Ekspor" }).click();
  await expect(page.getByRole("heading", { name: "Laporan dan Ekspor" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  const reportRow = page.getByRole("row").filter({ hasText: "PPh 21 bulanan" }).first();
  await expect(reportRow).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/reports.png`, fullPage: true });

  const download = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/reports/") &&
      response.url().endsWith("/download") &&
      response.request().method() === "GET",
  );
  await reportRow.getByRole("button", { name: /Unduh PPh 21 bulanan/ }).click();
  expect((await download).status()).toBe(200);
  await expect(page.getByText(/Tautan unduhan dibuka/)).toBeVisible();
});

test("employee role cannot open the payslip center", async ({ page }) => {
  await login(page, "Petugas Klaim", "Ruang Klaim");
  await page.goto("/payslips");
  await expect(page.getByRole("heading", { name: "Akses terbatas" })).toBeVisible();
});

test("mobile payslip list remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("link", { name: "Slip Gaji" }).click();
  await expect(page.getByRole("heading", { name: "Slip Gaji" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/payslips-mobile.png`, fullPage: true });
});
