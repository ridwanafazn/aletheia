import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(HERE, "../../../docs/evidence/design-phase4");
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

test("capture intelligence and audit screens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "Analis MIS", "MIS Intelligence");

  await expect(page.locator(".kpi-card")).toHaveCount(4);
  await expect(page.getByRole("img", { name: /Tren \d+ bulan/ })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/mis.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.getByText("Lihat data tren").click();
  await expect(page.getByRole("table")).toHaveCount(2);

  await page.getByRole("button", { name: "Buka What-If" }).click();
  await expect(page.getByRole("heading", { name: "What-If Sandbox" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/what-if.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await logout(page);
  await login(page, "Administrator Kepatuhan", "Ruang Klaim");
  await page.getByRole("link", { name: "Jejak Audit" }).click();
  await expect(page.getByRole("heading", { name: "Jejak Audit" })).toBeVisible();
  await expect(page.getByText("Rantai hash tenant")).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/audit.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "Verifikasi rantai" }).click();
  await expect(page.getByText("Rantai valid")).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/audit-verified.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Jejak Audit" })).toBeVisible();
  await expect(page.locator(".mobile-audit-list")).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/audit-mobile.png` });
  await page.locator(".mobile-audit-list").evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top - 76) });
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/audit-mobile-list.png` });
  expect(await accessibilityViolations(page)).toEqual([]);
});

test("capture mobile intelligence", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "Analis MIS", "MIS Intelligence");
  await expect(page.locator(".kpi-card")).toHaveCount(4);
  await expect(page.locator(".mis-health")).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/mis-mobile.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);
});
