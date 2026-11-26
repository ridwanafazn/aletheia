import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

import {
  BASE_URL,
  get,
  login,
  parseBody,
  post,
  SAU_BRANCH_BDG,
  SAU_TENANT,
  USERS,
  uuid,
} from "./lib/client.js";

export const options = {
  vus: 1,
  iterations: 5,
  maxDuration: "10m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    batch_duration: ["p(95)<60000"],
    checks: ["rate>0.99"],
  },
};

const BatchDuration = new Trend("batch_duration");
const WORKER_URL = __ENV.WORKER_URL ?? "http://host.docker.internal:4004";

export function setup() {
  const session = login(USERS.hr);
  return { token: session.token, userId: session.user.id };
}

export default function (data) {
  const month = __ITER + 1;
  const year = 2027;
  const periodMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const created = post(
    "/api/v1/payroll/batches",
    {
      branch_id: SAU_BRANCH_BDG,
      period_month: periodMonth,
      batch_type: "REGULAR",
      period_start: periodMonth,
      period_end: periodEnd,
    },
    data.token,
    "batch-create",
    `load-batch-${__ITER}-${uuid()}`.slice(0, 64),
  );
  check(created, { "batch create 201": (response) => response.status === 201 });
  const createdBody = parseBody(created);
  const batch = createdBody?.data?.batch;
  if (batch === undefined) {
    return;
  }

  const calculated = post(
    `/api/v1/payroll/batches/${batch.id}/calculate`,
    {},
    data.token,
    "batch-calculate",
    undefined,
  );
  check(calculated, { "batch calculate 202": (response) => response.status === 202 });

  const event = {
    event_id: uuid(),
    event_type: "PAYROLL_BATCH_CALCULATE",
    tenant_id: SAU_TENANT,
    correlation_id: uuid(),
    requested_by: data.userId,
    requested_at: new Date().toISOString(),
    batch_id: batch.id,
    policy_version_id: batch.policy_version_id,
    branch_id: batch.branch_id,
    period_start: batch.period_start,
    period_end: batch.period_end,
  };

  const startedAt = Date.now();
  const worker = http.post(`${WORKER_URL}/internal/v1/qstash/consume`, JSON.stringify(event), {
    headers: { "content-type": "application/json" },
    tags: { name: "worker-batch" },
    timeout: "70s",
  });
  BatchDuration.add(Date.now() - startedAt);
  check(worker, {
    "worker 200": (response) => response.status === 200,
    "worker selesai": (response) => {
      const body = parseBody(response);
      return body?.result?.status === "READY_FOR_APPROVAL";
    },
  });

  let status = "";
  let headcount = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const detail = get(`/api/v1/payroll/batches/${batch.id}`, data.token, "batch-detail");
    const body = parseBody(detail);
    status = body?.data?.batch?.status ?? "";
    headcount = Number(body?.data?.batch?.headcount ?? 0);
    if (status === "READY_FOR_APPROVAL") {
      break;
    }
    sleep(1);
  }

  check(
    { status, headcount },
    {
      "batch siap approval": (value) => value.status === "READY_FOR_APPROVAL",
      "headcount minimal 500": (value) => value.headcount >= 500,
    },
  );
}
