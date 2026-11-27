import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(HERE, "../../../docs/evidence/m6.4");
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

function uniqueWorkDate(): string {
  const date = new Date(Date.UTC(2030, 0, 1));
  date.setUTCDate(date.getUTCDate() + (Date.now() % 3650));
  return date.toISOString().slice(0, 10);
}

test("employee sees own payslip, attendance, and leave balances", async ({ page }) => {
  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await expect(page.getByText("Siti Aminah").first()).toBeVisible();
  await expect(page.getByText("EMP-BDG-001").first()).toBeVisible();

  await page.getByLabel("Periode").fill("2026-11");
  await expect(page.getByRole("cell", { name: "SLP-202611-001" })).toBeVisible();
  await expect(page.getByText("Budi Santoso")).toHaveCount(0);
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/me-payslips.png`, fullPage: true });

  await page.getByRole("tab", { name: "Absensi" }).click();
  await page.getByLabel("Periode").fill("2026-11");
  await expect(page.getByText("Lembur", { exact: true })).toBeVisible();
  await expect(page.getByText("4 jam")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/me-attendance.png`, fullPage: true });

  await page.getByRole("tab", { name: "Cuti dan Lembur" }).click();
  await expect(page.getByText("Cuti tahunan").first()).toBeVisible();
  await expect(page.getByText("10 hari").first()).toBeVisible();
  await expect(page.getByText("Riwayat cuti")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/me-leave.png`, fullPage: true });
});

test("employee submits unpaid leave, HR approves it, and employee sees the decision", async ({
  page,
}) => {
  const suffix = String(Date.now()).slice(-7);
  const reason = `E2E cuti ${suffix}`;

  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await page.getByRole("tab", { name: "Cuti dan Lembur" }).click();
  await page.getByLabel("Jenis cuti").selectOption("UNPAID");
  await page.getByLabel("Mulai").fill("2026-12-20");
  await page.getByLabel("Selesai").fill("2026-12-20");
  await page.getByLabel("Jumlah hari").fill("1");
  await page.locator("#my-leave-reason").fill(reason);
  await page.getByRole("button", { name: "Kirim pengajuan cuti" }).click();
  await expect(page.getByText("Pengajuan cuti tersimpan dan menunggu keputusan.")).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();

  await logout(page);
  await login(page, "Spesialis SDM", "hr.ops@aletheia.id", "Konsol Payroll");
  await page.getByRole("link", { name: "Cuti dan Lembur" }).click();
  const row = page.getByRole("row").filter({ hasText: reason }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Setujui" }).click();
  const dialog = page.getByRole("dialog", { name: "Setujui cuti" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Setujui" }).click();
  await expect(page.getByText("Keputusan cuti tersimpan.")).toBeVisible();

  await logout(page);
  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await page.getByRole("tab", { name: "Cuti dan Lembur" }).click();
  const approvedRow = page.getByRole("listitem").filter({ hasText: reason }).first();
  await expect(approvedRow).toBeVisible();
  await expect(approvedRow.getByText("Disetujui")).toBeVisible();
});

test("employee cannot submit leave beyond the remaining balance", async ({ page }) => {
  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await page.getByRole("tab", { name: "Cuti dan Lembur" }).click();
  await page.getByLabel("Jenis cuti").selectOption("ANNUAL");
  await page.getByLabel("Mulai").fill("2026-12-28");
  await page.getByLabel("Selesai").fill("2026-12-28");
  await page.getByLabel("Jumlah hari").fill("300");
  await page.locator("#my-leave-reason").fill("E2E saldo tidak cukup");
  await page.getByRole("button", { name: "Kirim pengajuan cuti" }).click();
  await expect(page.getByText("Saldo cuti tidak mencukupi untuk pengajuan ini")).toBeVisible();
});

test("employee submits overtime and HR rejects it", async ({ page }) => {
  const suffix = String(Date.now()).slice(-7);
  const reason = `E2E lembur ${suffix}`;
  const workDate = uniqueWorkDate();

  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await page.getByRole("tab", { name: "Cuti dan Lembur" }).click();
  await page.getByLabel("Tanggal kerja").fill(workDate);
  await page.getByLabel("Jam lembur").fill("1");
  await page.locator("#my-overtime-reason").fill(reason);
  await page.getByRole("button", { name: "Kirim pengajuan lembur" }).click();
  await expect(page.getByText("Pengajuan lembur tersimpan dan menunggu keputusan.")).toBeVisible();

  await logout(page);
  await login(page, "Spesialis SDM", "hr.ops@aletheia.id", "Konsol Payroll");
  await page.getByRole("link", { name: "Cuti dan Lembur" }).click();
  await page.getByRole("tab", { name: /Lembur/ }).click();
  const row = page.getByRole("row").filter({ hasText: reason }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Tolak" }).click();
  const dialog = page.getByRole("dialog", { name: "Tolak lembur" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Catatan/).fill("Tidak ada kebutuhan operasional");
  await dialog.getByRole("button", { name: "Tolak" }).click();
  await expect(page.getByText("Keputusan lembur tersimpan.")).toBeVisible();

  await logout(page);
  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await page.getByRole("tab", { name: "Cuti dan Lembur" }).click();
  const rejectedRow = page.getByRole("listitem").filter({ hasText: reason }).first();
  await expect(rejectedRow).toBeVisible();
  await expect(rejectedRow.getByText("Ditolak")).toBeVisible();
});

test("employee nav hides payroll, claims, and workforce routes", async ({ page }) => {
  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await expect(page.getByRole("link", { name: "Ruang Saya" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Konsol Payroll" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ruang Klaim" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Cuti dan Lembur" })).toHaveCount(0);

  for (const path of ["/workforce", "/payslips"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Akses terbatas" })).toBeVisible();
  }
});

test("employee cannot open payroll", async ({ page }) => {
  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await page.goto("/payroll");
  await expect(page.getByRole("heading", { name: "Akses terbatas" })).toBeVisible();
});

test("employee cannot open claims", async ({ page }) => {
  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await page.goto("/claims");
  await expect(page.getByRole("heading", { name: "Akses terbatas" })).toBeVisible();
});

test("self endpoints reject a forged personnel id", async ({ request }) => {
  const login = await request.post("http://127.0.0.1:8787/api/v1/auth/login", {
    data: {
      email: "employee.siti@aletheia.id",
      password: "AletheiaDemo!2026",
    },
  });
  expect(login.status()).toBe(200);
  const token = ((await login.json()) as { data: { access_token: string } }).data.access_token;
  const response = await request.get(
    "http://127.0.0.1:8787/api/v1/me/payslips?personnel_id=019361a2-7c00-7000-8000-000000000201",
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (response.status() === 200) {
    const body = (await response.json()) as {
      data: { items: Array<{ personnel_id: string }> };
    };
    for (const item of body.data.items) {
      expect(item.personnel_id).toBe("019361a2-7c00-7000-8000-000000000200");
    }
  } else {
    expect(response.status()).toBe(400);
  }
});

test("HR workforce queue is accessible and mobile usable", async ({ page }) => {
  await login(page, "Spesialis SDM", "hr.ops@aletheia.id", "Konsol Payroll");
  await page.getByRole("link", { name: "Cuti dan Lembur" }).click();
  await expect(page.getByRole("heading", { name: "Cuti dan Lembur" })).toBeVisible();
  const reimburseTab = page.getByRole("tab", { name: /Reimburse/ });
  await expect(reimburseTab).toBeVisible();
  await reimburseTab.click();
  await expect(reimburseTab).toHaveAttribute("aria-selected", "true");
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.getByRole("tab", { name: /Cuti/ }).click();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/workforce.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("link", { name: "Cuti dan Lembur" }).click();
  await expect(page.getByRole("heading", { name: "Cuti dan Lembur" })).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/workforce-mobile.png`, fullPage: true });
});

test("mobile self-service remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "Karyawan", "employee.siti@aletheia.id", "Ruang Saya");
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("link", { name: "Ruang Saya" }).click();
  await expect(page.getByRole("heading", { name: "Ruang Saya" })).toBeVisible();
  await page.getByRole("tab", { name: "Cuti dan Lembur" }).click();
  await expect(page.getByText("Ajukan cuti")).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/me-mobile.png`, fullPage: true });
});
