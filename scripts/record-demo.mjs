import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const outDir = resolve("docs/evidence/m6.1");
const videoDir = resolve(outDir, ".video");
mkdirSync(videoDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const video = page.video();

async function setCaption(text) {
  await page.evaluate((value) => {
    let element = document.getElementById("aletheia-demo-caption");
    if (element === null) {
      element = document.createElement("div");
      element.id = "aletheia-demo-caption";
      Object.assign(element.style, {
        position: "fixed",
        left: "24px",
        bottom: "24px",
        zIndex: "2147483647",
        maxWidth: "820px",
        padding: "12px 16px",
        borderRadius: "10px",
        background: "rgba(15, 23, 42, 0.92)",
        color: "#f8fafc",
        font: "600 18px/1.45 ui-sans-serif, system-ui, sans-serif",
        letterSpacing: "0.01em",
        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.32)",
        pointerEvents: "none",
      });
      document.body.appendChild(element);
    }
    element.textContent = value;
  }, text);
}

async function hold(text, milliseconds) {
  await setCaption(text);
  await page.waitForTimeout(milliseconds);
}

async function login(roleLabel, heading) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Selamat datang kembali" }).waitFor();
  await page.getByRole("button", { name: new RegExp(roleLabel) }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.getByRole("heading", { name: heading }).waitFor();
}

async function logout() {
  await page.getByRole("button", { name: "Keluar" }).click();
  await page.getByRole("heading", { name: "Selamat datang kembali" }).waitFor();
}

try {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Selamat datang kembali" }).waitFor();
  await hold("Aletheia · governed money movement", 8000);

  await login("Petugas Klaim", "Ruang Klaim");
  await page.getByRole("table").waitFor();
  await hold("1/8 · Workbench klaim: antrean, filter, dokumen", 10000);

  await page.goto("/claims/019361a2-7c00-7000-8000-000000000300", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "Detail Klaim" }).waitFor();
  await hold("2/8 · Detail klaim, dokumen, dan jejak keputusan", 12000);
  await logout();

  await login("Manajer Cabang", "Ruang Klaim");
  await page.getByRole("link", { name: "Antrean Persetujuan" }).click();
  await page.getByRole("heading", { name: "Antrean Persetujuan" }).waitFor();
  await hold("3/8 · Maker-checker, SoD, dan approval queue", 12000);
  await logout();

  await login("Spesialis SDM", "Konsol Payroll");
  await page.getByRole("button", { name: "PAY-SAU-202611-BDG01", exact: true }).click();
  await page.getByRole("heading", { name: "Detail Batch Payroll" }).waitFor();
  await hold("4/8 · Payroll batch, variance, dan approval", 12000);

  await page.getByRole("button", { name: "Siti Aminah", exact: true }).click();
  await page.getByRole("heading", { name: "Siti Aminah" }).waitFor();
  await hold("5/8 · PPh 21 TER, BPJS, dan komisi agen", 14000);
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "Siti Aminah" }).waitFor({ state: "hidden" });

  await page.getByRole("link", { name: "Karyawan dan Agen" }).click();
  await page.getByRole("heading", { name: "Karyawan dan Agen" }).waitFor();
  await hold("6/8 · Employee directory, absensi, dan cuti", 12000);
  await logout();

  await login("Analis MIS", "MIS Intelligence");
  await hold("7/8 · KPI lintas cabang dan tren", 12000);
  await page.getByRole("button", { name: "Buka What-If" }).click();
  await page.getByRole("heading", { name: "What-If Sandbox" }).waitFor();
  await hold("8/8 · What-If read-only dan variance", 14000);
  await logout();

  await login("Administrator Kepatuhan", "Ruang Klaim");
  await page.getByRole("link", { name: "Jejak Audit" }).click();
  await page.getByRole("heading", { name: "Jejak Audit" }).waitFor();
  await page.getByRole("button", { name: "Verifikasi rantai" }).click();
  await page.getByText("Rantai valid").first().waitFor({ timeout: 30000 });
  await hold("Audit hash chain · immutable evidence", 14000);
  await logout();

  await hold("Aletheia · policy-bound, auditable money movement", 8000);
} catch (error) {
  console.error("Demo recording failed:", error);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();

  const source = await video.path();
  if (source !== null) {
    const target = resolve(outDir, "aletheia-demo.webm");
    copyFileSync(source, target);
    rmSync(videoDir, { recursive: true, force: true });
    console.log(`Demo video saved: ${target}`);
  }
}
