import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const EVIDENCE = resolve("../../docs/evidence/m4.2");
mkdirSync(EVIDENCE, { recursive: true });

async function loginMis(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await page.getByRole("button", { name: /Analis MIS/ }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: "MIS Intelligence" })).toBeVisible();
}

async function accessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

test("MIS dashboard shows branch KPIs and accessible trend", async ({ page }) => {
  await loginMis(page);
  await expect(page.getByText("KPI per cabang")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("img", { name: /Tren \d+ bulan/ })).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-mis.png`, fullPage: true });
  await page.getByText("Lihat data tren").click();
  await expect(page.getByRole("table")).toHaveCount(2);

  await page
    .getByRole("link", { name: /Lihat payroll/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Konsol Payroll" })).toBeVisible();
  await expect(page).toHaveURL(/branch_id=/);
});

test("What-If sandbox compares simulation and blocks production writes", async ({ page }) => {
  await loginMis(page);
  await page.getByRole("button", { name: "Buka What-If" }).click();
  await expect(page.getByRole("heading", { name: "What-If Sandbox" })).toBeVisible();
  await expect(page.getByText("SIMULATION READ ONLY")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("Perbandingan", { exact: true })).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-what-if.png`, fullPage: true });

  await page.getByLabel("Nama simulasi").fill("Simulasi komisi naik sepuluh persen");
  await page.getByLabel("Penyesuaian tarif komisi").fill("10");
  await page.getByRole("button", { name: "Jalankan simulasi" }).click();
  await expect(page.getByText(/QStash belum aktif|masuk antrean worker/)).toBeVisible();
});

test("mobile MIS dashboard remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginMis(page);
  await expect(page.getByText("Klaim diajukan")).toBeVisible();
  await expect(page.locator(".mobile-mis-list")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/mobile-mis.png`, fullPage: true });
});
