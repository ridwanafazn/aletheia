import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const EVIDENCE = resolve(process.cwd(), "docs/evidence/ui-phase1");
mkdirSync(EVIDENCE, { recursive: true });

async function accessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await page.getByRole("button", { name: /Manajer Keuangan/ }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Ruang Klaim/ })).toBeVisible();
}

test("command palette opens with Ctrl K and navigates", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);

  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Pencarian dan aksi cepat" });
  await expect(dialog).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/command-palette.png`, fullPage: false });

  await dialog.getByLabel("Cari halaman atau aksi").fill("laporan");
  await expect(dialog.getByRole("button", { name: /Laporan dan Ekspor/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Laporan dan Ekspor" })).toBeVisible();

  await page.getByRole("button", { name: "Cari halaman atau aksi" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
