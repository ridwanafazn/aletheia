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

test("long role sidebars scroll while the account footer stays visible", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });

  for (const role of ["Manajer Keuangan", "Administrator Kepatuhan"]) {
    await login(page, role);
    await page.goto("/overview");

    const nav = page.locator("aside.sidebar nav.nav");
    const logout = page.locator(".sidebar__footer").getByRole("button", { name: "Keluar" });
    await expect(logout).toBeVisible();

    const logoutBox = await logout.boundingBox();
    expect(logoutBox).not.toBeNull();
    expect((logoutBox?.y ?? 0) + (logoutBox?.height ?? 0)).toBeLessThanOrEqual(720);

    const metrics = await nav.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    const lastItem = nav.getByRole("link", { name: "Jejak Audit" });
    await lastItem.evaluate((element) => element.scrollIntoView({ block: "nearest" }));
    const lastBox = await lastItem.boundingBox();
    expect(lastBox).not.toBeNull();
    expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(720);
    expect(await accessibilityViolations(page)).toEqual([]);

    if (role === "Administrator Kepatuhan") {
      await page.screenshot({ path: `${EVIDENCE}/compliance-sidebar.png` });
    }

    await logout.click();
  }
});
