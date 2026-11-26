import { check, sleep } from "k6";

import { get, login, USERS } from "./lib/client.js";

export const options = {
  vus: 50,
  duration: "5m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:claims-list}": ["p(95)<300"],
    "http_req_duration{name:claims-detail}": ["p(95)<300"],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  return { token: login(USERS.officer).token };
}

export default function (data) {
  const list = get("/api/v1/claims?limit=5", data.token, "claims-list");
  check(list, {
    "list 200": (response) => response.status === 200,
  });

  let claimId;
  try {
    claimId = JSON.parse(list.body)?.data?.items?.[0]?.id;
  } catch {
    claimId = undefined;
  }

  if (claimId !== undefined) {
    const detail = get(`/api/v1/claims/${claimId}`, data.token, "claims-detail");
    check(detail, {
      "detail 200": (response) => response.status === 200,
      "detail memiliki audit": (response) => {
        try {
          return Array.isArray(JSON.parse(response.body)?.data?.audit_history);
        } catch {
          return false;
        }
      },
    });
  }

  sleep(0.2);
}
