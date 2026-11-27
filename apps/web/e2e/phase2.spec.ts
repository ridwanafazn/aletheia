import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const EVIDENCE = resolve(process.cwd(), "docs/evidence/ui-phase2");
mkdirSync(EVIDENCE, { recursive: true });

const ROLES = [
  { label: "Petugas Klaim", lens: "Lensa Petugas Klaim", file: "claims-officer" },
  { label: "Manajer Cabang", lens: "Lensa Manajer Cabang", file: "branch-manager" },
  { label: "Manajer Keuangan", lens: "Lensa Manajer Keuangan", file: "finance-manager" },
  { label: "Spesialis SDM", lens: "Lensa Spesialis SDM", file: "hr-specialist" },
  { label: "Administrator Kepatuhan", lens: "Lensa Administrator Kepatuhan", file: "compliance" },
  { label: "Analis MIS", lens: "Lensa Analis MIS", file: "mis-analyst" },
] as const;

async function login(page: Page, role: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(role) }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL(/\/(claims|payroll|mis|me)/);
}

async function accessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

test("role-based homes show the right lens and action hierarchy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const role of ROLES) {
    await login(page, role.label);
    await page.goto("/overview");
    await expect(page.getByRole("heading", { name: /Selamat datang/ })).toBeVisible();
    await expect(page.getByText(role.lens, { exact: false })).toBeVisible();
    await expect(page.locator(".overview-actions-panel .panel__title")).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${EVIDENCE}/${role.file}.png`, fullPage: true });
    expect(await accessibilityViolations(page)).toEqual([]);
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  }
});
