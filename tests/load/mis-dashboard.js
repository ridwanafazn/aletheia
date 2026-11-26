import http from "k6/http";
import { check, sleep } from "k6";

import { authHeaders, BASE_URL, login, parseBody, USERS } from "./lib/client.js";

export const options = {
  vus: 30,
  duration: "5m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:mis-graphql}": ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

const QUERY = `
  query MisDashboard($reportMonth: String!, $months: Int!) {
    misExecutiveSummary(reportMonth: $reportMonth) {
      branchId
      branchCode
      branchName
      reportMonth
      totalClaimsSubmitted
      totalClaimsApprovedAmount
      claimApprovalRatePct
      avgTurnaroundHours
      totalPayrollDisbursed
      totalPph21Collected
      budgetUtilizationPct
      momVariancePct
    }
    misTrend(reportMonth: $reportMonth, months: $months) {
      branchCode
      reportMonth
      totalClaimsSubmitted
      totalClaimsApprovedAmount
    }
  }
`;

export function setup() {
  return { token: login(USERS.mis).token };
}

export default function (data) {
  const response = http.post(
    `${BASE_URL}/graphql`,
    JSON.stringify({
      query: QUERY,
      variables: { reportMonth: "2026-11", months: 6 },
    }),
    {
      headers: authHeaders(data.token),
      tags: { name: "mis-graphql" },
      timeout: "10s",
    },
  );

  check(response, {
    "graphql 200": (value) => value.status === 200,
    "graphql tanpa error": (value) => {
      const body = parseBody(value);
      return (
        body !== null && body.errors === undefined && Array.isArray(body.data?.misExecutiveSummary)
      );
    },
    "tren memiliki data": (value) => {
      const body = parseBody(value);
      return body !== null && Array.isArray(body.data?.misTrend);
    },
  });
  sleep(0.3);
}
