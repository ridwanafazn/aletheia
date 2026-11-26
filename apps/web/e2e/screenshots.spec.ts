import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const EVIDENCE = resolve("../../docs/evidence/m2.3");
mkdirSync(EVIDENCE, { recursive: true });

async function login(page: Page, roleLabel: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(roleLabel) }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ruang Klaim" })).toBeVisible();
}

async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
}

test("capture live preview evidence", async ({ page }) => {
  await page.goto("/login");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${EVIDENCE}/desktop-login.png`, fullPage: true });

  await login(page, "Petugas Klaim");
  await expect(page.getByRole("table")).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${EVIDENCE}/desktop-claims.png`, fullPage: true });

  await page.goto("/claims/019361a2-7c00-7000-8000-000000000300");
  await expect(page.getByRole("heading", { name: "Detail Klaim" })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${EVIDENCE}/desktop-claim-detail.png`, fullPage: true });
  await logout(page);

  await login(page, "Manajer Cabang");
  await page.getByRole("link", { name: "Antrean Persetujuan" }).click();
  await expect(page.getByRole("heading", { name: "Antrean Persetujuan" })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${EVIDENCE}/desktop-approvals.png`, fullPage: true });

  await logout(page);

  await login(page, "Administrator Kepatuhan");
  await page.getByRole("link", { name: "Jejak Audit" }).click();
  await expect(page.getByRole("heading", { name: "Jejak Audit" })).toBeVisible();
  await page.getByRole("button", { name: "Verifikasi rantai" }).click();
  await expect(page.getByText("Rantai valid")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${EVIDENCE}/desktop-audit.png`, fullPage: true });
  await logout(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "Petugas Klaim");
  await expect(page.locator(".mobile-claim-list")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${EVIDENCE}/mobile-claims.png`, fullPage: true });
});
