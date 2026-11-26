import { setDefaultResultOrder } from "node:dns";

setDefaultResultOrder("ipv4first");

const edgeUrl = (process.env.EDGE_URL ?? process.argv[2] ?? "").replace(/\/$/, "");
const webUrl = (process.env.WEB_URL ?? "").replace(/\/$/, "");
const password = process.env.SMOKE_PASSWORD ?? "AletheiaDemo!2026";

if (edgeUrl === "") {
  console.error("EDGE_URL wajib diisi, misalnya https://aletheia-edge.example.workers.dev");
  process.exit(1);
}

const checks = [];
function record(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(path, init = {}) {
  return fetch(`${edgeUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
}

async function login(email) {
  const response = await request("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) {
    throw new Error(`login ${email} gagal (${response.status})`);
  }
  return {
    token: body.data.access_token,
    user: body.data.user,
  };
}

async function authorized(token, path, init = {}) {
  return request(path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

try {
  const health = await request("/healthz");
  record("edge /healthz", health.status === 200, `status=${health.status}`);

  const ready = await request("/readyz");
  const readyBody = await ready.json().catch(() => null);
  record(
    "edge /readyz",
    ready.status === 200 && readyBody?.status === "ready",
    `status=${ready.status} body=${JSON.stringify(readyBody)}`,
  );

  const users = [
    ["officer.bdg@aletheia.id", "CLAIMS_OFFICER"],
    ["manager.bdg@aletheia.id", "BRANCH_MANAGER"],
    ["finance.vp@aletheia.id", "FINANCE_MANAGER"],
    ["hr.ops@aletheia.id", "HR_SPECIALIST"],
    ["compliance@aletheia.id", "COMPLIANCE_ADMIN"],
    ["mis.analyst@aletheia.id", "MIS_ANALYST"],
  ];

  const sessions = new Map();
  for (const [email, role] of users) {
    try {
      const session = await login(email);
      sessions.set(role, session);
      record(`login ${role}`, session.user?.role === role, `email=${email}`);
    } catch (error) {
      record(`login ${role}`, false, error instanceof Error ? error.message : "unknown");
    }
  }

  const officer = sessions.get("CLAIMS_OFFICER");
  if (officer) {
    const response = await authorized(officer.token, "/api/v1/claims?limit=1");
    const body = await response.json().catch(() => null);
    record(
      "claims list",
      response.status === 200 && Array.isArray(body?.data?.items),
      `status=${response.status}`,
    );
  }

  const manager = sessions.get("BRANCH_MANAGER");
  if (manager) {
    const response = await authorized(manager.token, "/api/v1/claims?limit=1");
    record("approval queue access", response.status === 200, `status=${response.status}`);
  }

  for (const role of ["FINANCE_MANAGER", "HR_SPECIALIST"]) {
    const session = sessions.get(role);
    if (session === undefined) continue;
    const response = await authorized(session.token, "/api/v1/payroll/batches?limit=1");
    const body = await response.json().catch(() => null);
    record(
      `payroll list ${role}`,
      response.status === 200 && Array.isArray(body?.data?.items),
      `status=${response.status}`,
    );
  }

  const compliance = sessions.get("COMPLIANCE_ADMIN");
  if (compliance) {
    const response = await authorized(compliance.token, "/api/v1/audit-logs/verify");
    const body = await response.json().catch(() => null);
    record(
      "audit chain verify",
      response.status === 200 && body?.data?.valid === true,
      `status=${response.status} valid=${body?.data?.valid}`,
    );
  }

  const mis = sessions.get("MIS_ANALYST");
  if (mis) {
    const reportMonth = new Date().toISOString().slice(0, 7);
    const response = await authorized(mis.token, "/graphql", {
      method: "POST",
      body: JSON.stringify({
        query: `query Smoke($month: String!) {
          misExecutiveSummary(reportMonth: $month) {
            branchCode
            totalClaimsSubmitted
          }
        }`,
        variables: { month: reportMonth },
      }),
    });
    const body = await response.json().catch(() => null);
    record(
      "MIS GraphQL",
      response.status === 200 && Array.isArray(body?.data?.misExecutiveSummary),
      `status=${response.status} month=${reportMonth}`,
    );
  }

  if (webUrl !== "") {
    const response = await fetch(webUrl, { signal: AbortSignal.timeout(20_000) });
    const csp = response.headers.get("content-security-policy") ?? "";
    record(
      "web CSP",
      response.status === 200 && csp.includes("default-src 'self'"),
      `status=${response.status}`,
    );
  }
} catch (error) {
  record("smoke execution", false, error instanceof Error ? error.message : "unknown");
}

const failed = checks.filter((check) => !check.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} smoke checks passed`);
if (failed.length > 0) {
  process.exit(1);
}
