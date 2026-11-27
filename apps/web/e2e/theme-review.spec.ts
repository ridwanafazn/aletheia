import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const OUT = resolve(process.cwd(), ".impeccable/review");
mkdirSync(OUT, { recursive: true });

async function accessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

async function login(page: Page, role: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(role) }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
}

test("review daylight workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/login");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/login.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await login(page, "Manajer Keuangan");
  await expect(page.getByRole("heading", { name: /Ruang Klaim/ })).toBeVisible();

  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: /Selamat datang/ })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/overview.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "Tutup sidebar" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/overview-collapsed.png`, fullPage: true });
  await page.getByRole("button", { name: "Buka sidebar" }).click();

  await page.goto("/payroll");
  await expect(page.getByRole("heading", { name: /Konsol Payroll/ })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/payroll.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  const pages = [
    ["/employees", "employees", /Karyawan dan Agen/],
    ["/workforce", "workforce", /Cuti dan Lembur/],
    ["/organization", "organization", /Struktur Organisasi/],
    ["/payslips", "payslips", /Slip Gaji/],
    ["/reports", "reports", /Laporan dan Ekspor/],
    ["/claims", "claims", /Ruang Klaim/],
    ["/mis", "mis", /MIS Intelligence/],
    ["/audit", "audit", /Jejak Audit/],
    ["/profile", "profile", /^Profil$/],
  ] as const;

  for (const [path, name, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  }

  await page.getByRole("button", { name: "Buka halaman profil" }).click();
  await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: /Selamat datang/ })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/overview-mobile.png`, fullPage: true });

  for (const [path, name, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}-mobile.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Keluar dari sesi" }).click();
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await login(page, "Karyawan");
  await expect(page.getByRole("heading", { name: /Ruang Saya/ })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/me.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: /Ruang Saya/ })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/me-mobile.png`, fullPage: true });
});
