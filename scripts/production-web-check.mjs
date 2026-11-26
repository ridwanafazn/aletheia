import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const webUrl = (process.env.WEB_URL ?? "https://aletheia-web-preview.pages.dev").replace(/\/$/, "");
const evidenceDir = resolve("docs/evidence/m6.2");
mkdirSync(evidenceDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

async function login(roleLabel, heading) {
  await page.goto(`${webUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Selamat datang kembali" }).waitFor();
  await page.getByRole("button", { name: new RegExp(roleLabel) }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.getByRole("heading", { name: heading }).waitFor({ timeout: 60_000 });
}

async function logout() {
  await page.getByRole("button", { name: "Keluar" }).click();
  await page.getByRole("heading", { name: "Selamat datang kembali" }).waitFor({ timeout: 30_000 });
}

try {
  await login("Petugas Klaim", "Ruang Klaim");
  await page.getByRole("table").waitFor({ timeout: 60_000 });
  await page.screenshot({ path: `${evidenceDir}/web-claims.png`, fullPage: true });
  console.log("PASS web login CLAIMS_OFFICER + claims table");
  await logout();

  await login("Spesialis SDM", "Konsol Payroll");
  await page.getByRole("table").waitFor({ timeout: 60_000 });
  await page.screenshot({ path: `${evidenceDir}/web-payroll.png`, fullPage: true });
  console.log("PASS web login HR_SPECIALIST + payroll table");
  await logout();

  await login("Analis MIS", "MIS Intelligence");
  await page.screenshot({ path: `${evidenceDir}/web-mis.png`, fullPage: true });
  console.log("PASS web login MIS_ANALYST + MIS dashboard");
} catch (error) {
  console.error("FAIL web production check:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (errors.length > 0) {
    console.log(`Console errors (${errors.length}):`);
    for (const error of errors.slice(0, 10)) console.log(` - ${error}`);
  } else {
    console.log("PASS no browser console/page errors");
  }
  await context.close();
  await browser.close();
}
