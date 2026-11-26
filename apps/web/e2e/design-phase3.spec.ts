import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(HERE, "../../../docs/evidence/design-phase3");
mkdirSync(EVIDENCE, { recursive: true });

async function login(page: Page, roleLabel: string, heading: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(roleLabel) }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
}

async function accessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

test("capture phase 3 operational screens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/payroll.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.getByRole("link", { name: "Karyawan dan Agen" }).click();
  await expect(page.getByRole("heading", { name: "Karyawan dan Agen" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/employees.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.getByRole("link", { name: "Cuti dan Lembur" }).click();
  await expect(page.getByRole("heading", { name: "Cuti dan Lembur" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/workforce.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.getByRole("tab", { name: /Reimburse/ }).click();
  await expect(page.getByText("Perjalanan dinas Bandung")).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/workforce-reimburse.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);
  await logout(page);

  await login(page, "Petugas Klaim", "Ruang Klaim");
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/claims.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);
  await logout(page);

  await login(page, "Karyawan", "Ruang Saya");
  await page.getByRole("tab", { name: "Cuti dan Lembur" }).click();
  await expect(page.getByText("Ajukan cuti")).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/me.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ruang Saya" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/me-mobile.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);
});
