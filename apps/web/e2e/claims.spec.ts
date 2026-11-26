import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "AletheiaDemo!2026";
const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:8787";
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

async function accessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

test("login page and claims workbench are accessible", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-login.png`, fullPage: true });

  await page.getByRole("button", { name: /Petugas Klaim/ }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ruang Klaim" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-claims.png`, fullPage: true });

  await page.goto("/claims/019361a2-7c00-7000-8000-000000000300");
  await expect(page.getByRole("heading", { name: "Detail Klaim" })).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-claim-detail.png`, fullPage: true });
});

test("claim flows from draft to disbursement", async ({ page }) => {
  const suffix = String(Date.now()).slice(-7);
  await login(page, "Petugas Klaim");

  await page.getByRole("button", { name: "Klaim Baru" }).click();
  await expect(page.getByRole("heading", { name: "Klaim Baru" })).toBeVisible();

  await page.getByLabel(/Nama pemohon/).fill(`Demo E2E ${suffix}`);
  await page.getByLabel(/NIK 16 digit/).fill(`327300000${suffix}`);
  await page.getByLabel(/Rekening penerima/).fill(`8800${suffix}3344`);
  await page.getByLabel(/Nominal diajukan/).fill("4250000.00");

  await page.getByLabel("Unggah Kartu identitas").setInputFiles("e2e/fixtures/identity-card.pdf");
  await expect(page.getByText(/demo\/identity_card/)).toBeVisible();
  await page.getByLabel("Unggah Tagihan medis").setInputFiles("e2e/fixtures/identity-card.pdf");
  await expect(page.getByText(/demo\/medical_invoice/)).toBeVisible();

  await page.getByRole("button", { name: "Simpan draf" }).click();
  await expect(page.getByRole("heading", { name: "Detail Klaim" })).toBeVisible();
  await expect(page.getByText("Draf tersimpan")).toBeVisible();
  const description = await page.locator(".page-header__description").innerText();
  const claimNumber = description.split(" · ")[0]!.trim();
  expect(claimNumber).toMatch(/^CLM-/);

  await page.getByRole("button", { name: "Submit klaim" }).click();
  await page.getByRole("button", { name: "Submit sekarang" }).click();
  await expect(page.getByText("Menunggu keputusan", { exact: true }).first()).toBeVisible();

  await logout(page);
  await login(page, "Manajer Cabang");
  await page.getByRole("link", { name: "Antrean Persetujuan" }).click();
  await expect(page.getByRole("heading", { name: "Antrean Persetujuan" })).toBeVisible();
  await page.getByRole("link", { name: claimNumber, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Detail Klaim" })).toBeVisible();
  await page.getByRole("button", { name: "Ambil keputusan" }).click();
  await page.getByLabel(/Alasan/).fill("Dokumen lengkap dan dalam batas kewenangan cabang");
  await page.getByRole("button", { name: "Setujui klaim" }).click();
  await expect(page.getByText(/berstatus Disetujui/)).toBeVisible();

  await logout(page);
  await login(page, "Manajer Keuangan");
  await page.getByRole("link", { name: "Ruang Klaim" }).click();
  await page.getByRole("link", { name: claimNumber, exact: true }).click();
  await page.getByRole("button", { name: "Cairkan klaim" }).click();
  await page.getByRole("button", { name: "Kirim pencairan" }).click();
  await expect(page.getByText("Sudah dicairkan", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Pencairan selesai/)).toBeVisible();
});

test("compliance review and audit verification", async ({ page, request }) => {
  const apiLogin = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: "compliance@aletheia.id", password: PASSWORD },
  });
  const token = ((await apiLogin.json()) as { data: { access_token: string } }).data.access_token;
  const list = await request.get(`${API_URL}/api/v1/claims?status=ESCALATED&limit=100`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await list.json()) as {
    data: { items: Array<{ id: string; has_conflict_flag: boolean }> };
  };
  let candidate: { id: string } | undefined;
  for (const item of body.data.items.filter((row) => row.has_conflict_flag).slice(0, 10)) {
    const detail = await request.get(`${API_URL}/api/v1/claims/${item.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const detailBody = (await detail.json()) as {
      data: { compliance_reviewed_at: string | null };
    };
    if (detailBody.data.compliance_reviewed_at === null) {
      candidate = item;
      break;
    }
  }
  if (candidate === undefined) {
    test.skip(true, "Tidak ada klaim konflik tanpa review pada seed");
  }

  await login(page, "Administrator Kepatuhan");
  await page.goto(`/claims/${candidate.id}`);
  await expect(page.getByRole("heading", { name: "Detail Klaim" })).toBeVisible();
  const reviewButton = page.getByRole("button", { name: "Review kepatuhan" });
  if ((await reviewButton.count()) === 0) {
    test.skip(true, "Klaim konflik sudah memiliki review kepatuhan");
  }
  await reviewButton.click();
  await page
    .getByLabel(/Catatan review/)
    .fill("Rekening nasabah valid dan bukan milik personel internal");
  await page.getByRole("button", { name: "Simpan review" }).click();
  await expect(page.getByText(/Review dicatat/)).toBeVisible();

  await page.getByRole("link", { name: "Jejak Audit" }).click();
  await expect(page.getByRole("heading", { name: "Jejak Audit" })).toBeVisible();
  await page.getByRole("button", { name: "Verifikasi rantai" }).click();
  await expect(page.getByText("Rantai valid")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-audit.png`, fullPage: true });
});

test("mobile workbench remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "Petugas Klaim");
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await expect(page.getByRole("link", { name: "Ruang Klaim" })).toBeVisible();
  await page.getByRole("button", { name: "Tutup navigasi" }).click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/sidebar--open/);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${EVIDENCE}/mobile-claims.png`, fullPage: true });
  expect(await accessibilityViolations(page)).toEqual([]);
});

test("audit explorer verifies the chain", async ({ page }) => {
  await login(page, "Administrator Kepatuhan");
  await page.getByRole("link", { name: "Jejak Audit" }).click();
  await expect(page.getByRole("heading", { name: "Jejak Audit" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Verifikasi rantai" }).click();
  await expect(page.getByText("Rantai valid")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/desktop-audit.png`, fullPage: true });
});
