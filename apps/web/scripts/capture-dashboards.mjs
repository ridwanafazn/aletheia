import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const base = process.env.GRAFANA_URL ?? "http://localhost:3000";
const output = new URL("../../../docs/evidence/slo/", import.meta.url);
await mkdir(output, { recursive: true });

const dashboards = [
  ["aletheia-overview", "m5.2-overview"],
  ["aletheia-domain", "m5.2-domain"],
  ["aletheia-data-layer", "m5.2-data-layer"],
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
  for (const [uid, name] of dashboards) {
    const url = `${base}/d/${uid}?orgId=1&from=now-30m&to=now&kiosk`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(8_000);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
    console.log(`captured ${name}`);
  }
} finally {
  await browser.close();
}
