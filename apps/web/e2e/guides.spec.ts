import { expect, test } from "@playwright/test";

test("each role can download its own guide from the profile page", async ({ page, request }) => {
  for (const [role, guide] of [
    ["Manajer Keuangan", "panduan-manajer-keuangan.pdf"],
    ["Administrator Kepatuhan", "panduan-administrator-kepatuhan.pdf"],
    ["Karyawan", "panduan-karyawan.pdf"],
  ] as const) {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(role) }).click();
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL(/\/(claims|payroll|mis|me)/);
    await page.goto("/profile");

    const link = page.getByRole("link", { name: new RegExp(`Unduh panduan ${role}`) });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `/guides/${guide}`);

    const response = await request.get(`/guides/${guide}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");

    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  }
});
