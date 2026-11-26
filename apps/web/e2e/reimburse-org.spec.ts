import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(HERE, "../../../docs/evidence/m6.5");
mkdirSync(EVIDENCE, { recursive: true });

async function login(page: Page, roleLabel: string, email: string, heading: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(roleLabel) }).click();
  await expect(page.getByLabel("Email")).toHaveValue(email);
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

test("employee submits reimbursement, HR approves, finance pays", async ({ page }) => {
  const suffix = String(Date.now()).slice(-7);
  const description = `E2E reimburse ${suffix}`;

  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await page.getByRole("tab", { name: "Reimburse" }).click();
  await page.getByLabel("Kategori").selectOption("TRANSPORT");
  await page.getByLabel("Tanggal pengeluaran").fill("2026-11-20");
  await page.getByLabel("Nominal").fill("150000.00");
  await page.getByLabel("Deskripsi").fill(description);
  await page
    .getByLabel("Tautan bukti")
    .fill("https://res.cloudinary.com/demo/image/upload/receipt.pdf");
  await page.getByRole("button", { name: "Kirim reimburse" }).click();
  await expect(page.getByText("Reimburse tersimpan dan menunggu keputusan.")).toBeVisible();
  await expect(page.getByText(description)).toBeVisible();
  await expect(page.getByText("Menunggu").first()).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/me-reimbursements.png`, fullPage: true });

  await logout(page);
  await login(page, "Spesialis SDM", "hr.ops@aletheia.id", "Konsol Payroll");
  await page.getByRole("link", { name: "Cuti dan Lembur" }).click();
  await page.getByRole("tab", { name: /Reimburse/ }).click();
  const hrRow = page.getByRole("row").filter({ hasText: description }).first();
  await expect(hrRow).toBeVisible();
  await hrRow.getByRole("button", { name: "Setujui" }).click();
  const dialog = page.getByRole("dialog", { name: "Setujui reimburse" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Setujui" }).click();
  await expect(page.getByText("Keputusan reimburse tersimpan.")).toBeVisible();

  await logout(page);
  await login(page, "Manajer Keuangan", "finance.vp@aletheia.id", "Ruang Klaim");
  await page.getByRole("link", { name: "Cuti dan Lembur" }).click();
  await page.getByRole("tab", { name: /Reimburse/ }).click();
  const financeRow = page.getByRole("row").filter({ hasText: description }).first();
  await expect(financeRow).toBeVisible();
  await financeRow.getByRole("button", { name: "Bayar" }).click();
  await expect(page.getByText("Reimburse ditandai dibayar.")).toBeVisible();

  await logout(page);
  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await page.getByRole("tab", { name: "Reimburse" }).click();
  const employeeRow = page.getByRole("row").filter({ hasText: description }).first();
  await expect(employeeRow).toBeVisible();
  await expect(employeeRow.getByText("Dibayar")).toBeVisible();
});

test("organization structure shows departments, positions, and personnel", async ({ page }) => {
  await login(page, "Spesialis SDM", "hr.ops@aletheia.id", "Konsol Payroll");
  await page.getByRole("link", { name: "Struktur Organisasi" }).click();
  await expect(page.getByRole("heading", { name: "Struktur Organisasi" })).toBeVisible();
  await expect(page.getByText("Human Resources").first()).toBeVisible();
  await expect(page.getByText("Siti Aminah").first()).toBeVisible();
  await expect(page.getByText("Claims Operations").first()).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/organization.png`, fullPage: true });
});

test("reimbursement route is hidden from employee and org is mobile usable", async ({ page }) => {
  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await expect(page.getByRole("link", { name: "Struktur Organisasi" })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("link", { name: "Ruang Saya" }).click();
  await page.getByRole("tab", { name: "Reimburse" }).click();
  await expect(page.getByText("Ajukan reimburse")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/me-reimbursements-mobile.png`, fullPage: true });
});
