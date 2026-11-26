import { check, sleep } from "k6";

import { get, login, USERS } from "./lib/client.js";

export const options = {
  vus: 5,
  duration: "1m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  return {
    officer: login(USERS.officer).token,
    mis: login(USERS.mis).token,
  };
}

export default function (data) {
  const claims = get("/api/v1/claims?limit=5", data.officer, "smoke-claims");
  check(claims, {
    "claims 200": (response) => response.status === 200,
    "claims envelope sukses": (response) => JSON.parse(response.body).success === true,
  });

  const payroll = get("/api/v1/payroll/batches?limit=5", data.mis, "smoke-payroll");
  check(payroll, {
    "payroll 200 atau 403": (response) => [200, 403].includes(response.status),
  });

  sleep(0.5);
}
