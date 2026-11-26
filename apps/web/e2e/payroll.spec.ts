import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const EVIDENCE = resolve("../../docs/evidence/m3.3");
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

test("HR sees the payroll pipeline and calculation breakdown", async ({ page }) => {
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await expect(page.getByRole("table")).toBeVisible();
  const payrollTable = page.locator(".payroll-table");
  await expect(
    payrollTable.getByRole("button", { name: "PAY-SAU-202611-BDG01", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".payroll-pipeline").getByText("Siap disetujui")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-payroll.png`, fullPage: true });

  await page.getByRole("button", { name: "PAY-SAU-202611-BDG01", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Detail Batch Payroll" })).toBeVisible();
  await expect(page.getByText(/31\.000\.000/).first()).toBeVisible();
  await expect(page.getByText("Item perhitungan")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-payroll-detail.png`, fullPage: true });

  await page.getByRole("button", { name: "Siti Aminah", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Siti Aminah" })).toBeVisible();
  await expect(page.getByText("Net diterima")).toBeVisible();
  await expect(page.getByText("Komponen bruto")).toBeVisible();
  await expect(page.getByText("Kontribusi pemberi kerja")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-payroll-breakdown.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Siti Aminah" })).not.toBeVisible();
});

test("employee directory opens attendance and leave summary", async ({ page }) => {
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.getByRole("link", { name: "Karyawan dan Agen" }).click();
  await expect(page.getByRole("heading", { name: "Karyawan dan Agen" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-employees.png`, fullPage: true });

  await page.getByLabel("Cari personel").fill("Siti");
  await expect(page.getByRole("button", { name: "Siti Aminah", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Siti Aminah", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Siti Aminah" })).toBeVisible();
  await page.getByLabel("Periode", { exact: true }).fill("2026-11");
  await expect(page.getByRole("heading", { name: "Ringkasan absensi" })).toBeVisible();
  await expect(page.getByText("Hadir", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Riwayat cuti" })).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-employee-drawer.png`, fullPage: true });
});

test("finance can read payroll and does not see maker actions", async ({ page }) => {
  await login(page, "Manajer Keuangan", "Ruang Klaim");
  await page.getByRole("link", { name: "Konsol Payroll" }).click();
  await expect(page.getByRole("heading", { name: "Konsol Payroll" })).toBeVisible();
  await page.getByRole("button", { name: "PAY-SAU-202611-BDG01", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Detail Batch Payroll" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setujui batch" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cairkan batch" })).toHaveCount(0);
  await expect(page.getByText("Seluruh item sudah dibayar")).toBeVisible();
});

test("batch creation dialog validates required fields", async ({ page }) => {
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.getByRole("button", { name: "Batch Baru" }).click();
  const dialog = page.getByRole("dialog", { name: "Batch payroll baru" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/Cabang/)).toBeVisible();
  await expect(dialog.getByLabel(/Periode/)).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/desktop-payroll-create.png`, fullPage: true });
  await page.getByRole("button", { name: "Batal" }).click();
  await expect(page.getByRole("dialog", { name: "Batch payroll baru" })).not.toBeVisible();
});

test("mobile payroll console remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await expect(page.getByText("Batch terlihat")).toBeVisible();
  await expect(page.locator(".mobile-payroll-list")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/mobile-payroll.png`, fullPage: true });
});
