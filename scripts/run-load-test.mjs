import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const scenario = process.argv[2] ?? "smoke";
const valid = new Set([
  "smoke",
  "claims-read",
  "claim-submit",
  "approval-race",
  "payroll-batch",
  "mis-dashboard",
  "payment-retry",
]);
if (!valid.has(scenario)) {
  console.error(`Skenario tidak dikenal: ${scenario}`);
  process.exit(1);
}

const root = process.cwd().replaceAll("\\", "/");
const mount = `${root}/tests/load:/scripts`;
const args = [
  "run",
  "--rm",
  "-v",
  mount,
  "-e",
  `BASE_URL=${process.env.BASE_URL ?? "http://host.docker.internal:8787"}`,
  "-e",
  `WORKER_URL=${process.env.WORKER_URL ?? "http://host.docker.internal:4004"}`,
  "-e",
  `DEMO_PASSWORD=${process.env.DEMO_PASSWORD ?? "AletheiaDemo!2026"}`,
  "-e",
  `PAYMENT_WEBHOOK_SECRET=${process.env.PAYMENT_WEBHOOK_SECRET ?? "dev-only-payment-webhook-secret"}`,
  "grafana/k6:2.4.0",
  "run",
  `/scripts/${scenario}.js`,
];

const result = spawnSync("docker", args, { stdio: "inherit" });
if (result.error !== undefined) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
