import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "AletheiaDemo!2026";
async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (item) => item.impact === "critical" || item.impact === "serious",
  );
}

async function login(page: Page, role: string, heading: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(role) }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
}

async function check(page: Page, label: string): Promise<void> {
  const found = await violations(page);
  expect(found, `${label}: ${found.map((item) => item.id).join(", ")}`).toEqual([]);
}

test("layar kritis bebas pelanggaran axe serius", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await check(page, "login");

  await login(page, "Petugas Klaim", "Ruang Klaim");
  await check(page, "claims");
  await page.goto("/claims/019361a2-7c00-7000-8000-000000000300");
  await expect(page.getByRole("heading", { name: "Detail Klaim" })).toBeVisible();
  await check(page, "claim-detail");
  await logout(page);

  await login(page, "Manajer Cabang", "Ruang Klaim");
  await page.getByRole("link", { name: "Antrean Persetujuan" }).click();
  await expect(page.getByRole("heading", { name: "Antrean Persetujuan" })).toBeVisible();
  await check(page, "approvals");
  await logout(page);

  await login(page, "Spesialis SDM", "Konsol Payroll");
  await check(page, "payroll");
  const firstBatch = page.locator(".payroll-table tbody tr").first().getByRole("button").first();
  await firstBatch.click();
  await expect(page.getByRole("heading", { name: "Detail Batch Payroll" })).toBeVisible();
  await check(page, "payroll-detail");
  await logout(page);

  await login(page, "Analis MIS", "MIS Intelligence");
  await check(page, "mis");
  await page.getByRole("button", { name: "Buka What-If" }).click();
  await expect(page.getByRole("heading", { name: "What-If Sandbox" })).toBeVisible();
  await check(page, "what-if");
  await logout(page);

  await login(page, "Administrator Kepatuhan", "Ruang Klaim");
  await page.getByRole("link", { name: "Jejak Audit" }).click();
  await expect(page.getByRole("heading", { name: "Jejak Audit" })).toBeVisible();
  await check(page, "audit");
});

test("dialog dan form dapat ditutup dengan keyboard", async ({ page }) => {
  await login(page, "Spesialis SDM", "Konsol Payroll");
  await page.getByRole("button", { name: "Batch Baru" }).click();
  const dialog = page.getByRole("dialog", { name: "Batch payroll baru" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Batch Baru" })).toBeFocused();
});
