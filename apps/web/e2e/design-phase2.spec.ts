import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(HERE, "../../../docs/evidence/design-phase2");
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

test("capture quiet ledger overview and phase 2 pages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "Manajer Keuangan", "Ruang Klaim");

  await page.getByRole("link", { name: "Ikhtisar" }).click();
  await expect(page.getByRole("heading", { name: /Selamat datang/ })).toBeVisible();
  await expect(page.locator(".overview-actions-panel .panel__title")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${EVIDENCE}/overview.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.getByRole("link", { name: "Laporan dan Ekspor" }).click();
  await expect(page.getByRole("heading", { name: "Laporan dan Ekspor" })).toBeVisible();
  await expect(page.getByText("Status laporan")).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${EVIDENCE}/reports.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.getByRole("link", { name: "Struktur Organisasi" }).click();
  await expect(page.getByRole("heading", { name: "Struktur Organisasi" })).toBeVisible();
  await expect(page.getByText("Human Resources").first()).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${EVIDENCE}/organization.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: /Selamat datang/ })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${EVIDENCE}/overview-mobile.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);
});
