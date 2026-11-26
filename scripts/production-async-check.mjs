import { existsSync, readFileSync } from "node:fs";

const values = new Map();
if (existsSync(".env.production.local")) {
  for (const line of readFileSync(".env.production.local", "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
}

const edgeUrl = (process.env.EDGE_URL ?? values.get("EDGE_URL") ?? "").replace(/\/$/, "");
const email = process.env.SMOKE_EMAIL ?? "mis.analyst@aletheia.id";
const password = process.env.SMOKE_PASSWORD ?? "AletheiaDemo!2026";

if (edgeUrl === "") {
  console.error("EDGE_URL wajib diisi di .env.production.local atau environment.");
  process.exit(1);
}

async function jsonFetch(path, init = {}) {
  const response = await fetch(`${edgeUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function graphql(token, query, variables) {
  const body = await jsonFetch("/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  if (body.errors !== undefined) {
    throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`);
  }
  return body.data;
}

const login = await jsonFetch("/api/v1/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
const token = login.data.access_token;
console.log(`PASS login ${email}`);

const policyResponse = await jsonFetch("/api/v1/policies/active/PAYROLL_TAX_POLICY", {
  headers: { authorization: `Bearer ${token}` },
});
const policy = policyResponse.data;
if (policy?.id === undefined || policy?.rules_payload?.agent_commission_tiers === undefined) {
  throw new Error("Policy payroll aktif tidak memiliki agent_commission_tiers");
}
console.log(`PASS active payroll policy ${policy.version_tag ?? policy.id}`);

const period = new Date();
const periodMonth = `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, "0")}`;
const periodStart = `${periodMonth}-01`;
const lastDay = new Date(
  Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 0),
).getUTCDate();
const periodEnd = `${periodMonth}-${String(lastDay).padStart(2, "0")}`;
const simulationName = `Async QStash ${Date.now()}`;

const mutation = await graphql(
  token,
  `
    mutation RunWhatIf($input: WhatIfSimulationInput!) {
      runWhatIfSimulation(input: $input) {
        eventId
        status
        enqueued
      }
    }
  `,
  {
    input: {
      simulationName,
      basePolicyVersionId: policy.id,
      simulatedRulesPayload: {
        commission_mode: policy.rules_payload.commission_mode,
        agent_commission_tiers: policy.rules_payload.agent_commission_tiers.map((tier) => ({
          min_sales: tier.min_sales,
          max_sales: tier.max_sales,
          commission_rate: (Number(tier.commission_rate) * 1.1).toFixed(4),
        })),
      },
      targetPeriodStart: periodStart,
      targetPeriodEnd: periodEnd,
    },
  },
);

const run = mutation.runWhatIfSimulation;
if (run.enqueued !== true) {
  throw new Error(`QStash tidak mengirim event: ${JSON.stringify(run)}`);
}
console.log(`PASS QStash enqueue event=${run.eventId}`);

let found;
for (let attempt = 1; attempt <= 18; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const data = await graphql(
    token,
    `
      query WhatIfList($limit: Int!) {
        whatIfSimulations(limit: $limit) {
          id
          simulationName
          actualTotalCost
          simulatedTotalCost
          varianceAmount
          variancePercentage
          createdAt
        }
      }
    `,
    { limit: 10 },
  );
  found = data.whatIfSimulations.find((item) => item.simulationName === simulationName);
  if (found !== undefined) {
    console.log(
      `PASS worker processed simulation in ~${attempt * 5}s: actual=${found.actualTotalCost} simulated=${found.simulatedTotalCost} variance=${found.varianceAmount}`,
    );
    break;
  }
  console.log(`WAIT worker result ${attempt * 5}s`);
}

if (found === undefined) {
  throw new Error(
    "Worker tidak memproses simulasi dalam 90 detik; cek WORKER_URL/WORKER_PUBLIC_URL/QStash.",
  );
}
