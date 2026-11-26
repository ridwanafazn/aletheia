import { setDefaultResultOrder } from "node:dns";
import { existsSync, readFileSync } from "node:fs";

setDefaultResultOrder("ipv4first");

const values = new Map();
if (existsSync(".env.production.local")) {
  for (const line of readFileSync(".env.production.local", "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
}

const pick = (key) => process.env[key] ?? values.get(key) ?? "";
const targets = [
  ["governance", pick("GOVERNANCE_URL")],
  ["claims", pick("CLAIMS_URL")],
  ["payroll", pick("PAYROLL_URL")],
  ["worker", pick("WORKER_URL")],
  ["edge", pick("EDGE_URL")],
].filter(([, url]) => url.length > 0);

if (targets.length === 0) {
  console.error(
    "Tidak ada URL production. Isi .env.production.local atau env GOVERNANCE_URL/CLAIMS_URL/PAYROLL_URL/WORKER_URL/EDGE_URL.",
  );
  process.exit(1);
}

async function warm(name, baseUrl) {
  const url = `${baseUrl.replace(/\/$/, "")}/healthz`;
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    const duration = Date.now() - started;
    const body = (await response.text()).slice(0, 120);
    console.log(
      `${response.ok ? "PASS" : "FAIL"} ${name} ${response.status} ${duration}ms ${body}`,
    );
    return response.ok;
  } catch (error) {
    const duration = Date.now() - started;
    const cause =
      error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
    console.log(
      `FAIL ${name} ${duration}ms ${error instanceof Error ? error.message : "unknown"}${cause}`,
    );
    return false;
  }
}

const results = await Promise.all(targets.map(([name, url]) => warm(name, url)));
if (results.some((ok) => !ok)) {
  process.exit(1);
}
console.log("Semua service production sudah hangat.");
