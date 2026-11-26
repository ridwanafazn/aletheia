import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

import { login, post, USERS, uuid } from "./lib/client.js";

export const options = {
  vus: 20,
  duration: "5m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    mutation_duration: ["p(95)<800"],
    checks: ["rate>0.99"],
  },
};

const MutationTrend = new Trend("mutation_duration");

export function setup() {
  const session = login(USERS.officer);
  return { token: session.token, userId: session.user.id, branchId: session.user.branch_id };
}

function claimPayload(index) {
  const suffix = String(index).padStart(12, "0");
  return {
    claimant_name: `Load Claimant ${index}`,
    claimant_nik: `3273${suffix}`,
    claimant_bank_account: `8800${suffix}`,
    claim_category: "HEALTH",
    requested_amount: "1000000.00",
    documents: [
      {
        document_type: "IDENTITY_CARD",
        cloudinary_public_id: `aletheia/load/identity-${index}`,
        secure_url: `https://res.cloudinary.com/aletheia-demo/image/upload/identity-${index}.pdf`,
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      },
      {
        document_type: "MEDICAL_INVOICE",
        cloudinary_public_id: `aletheia/load/invoice-${index}`,
        secure_url: `https://res.cloudinary.com/aletheia-demo/image/upload/invoice-${index}.pdf`,
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      },
    ],
  };
}

export default function (data) {
  const index = `${__VU}${String(__ITER).padStart(4, "0")}`;
  const startedAt = Date.now();

  const created = post(
    "/api/v1/claims",
    claimPayload(index),
    data.token,
    "claim-create",
    `load-create-${__VU}-${__ITER}-${uuid()}`.slice(0, 64),
  );
  check(created, {
    "create 201": (response) => response.status === 201,
  });

  let claimId;
  try {
    claimId = JSON.parse(created.body)?.data?.id;
  } catch {
    claimId = undefined;
  }
  if (claimId === undefined) {
    MutationTrend.add(Date.now() - startedAt);
    return;
  }

  const submitted = post(
    `/api/v1/claims/${claimId}/submit`,
    {},
    data.token,
    "claim-submit",
    undefined,
  );
  check(submitted, {
    "submit 200": (response) => response.status === 200,
    "status under review": (response) => {
      try {
        return ["UNDER_REVIEW", "ESCALATED"].includes(JSON.parse(response.body)?.data?.status);
      } catch {
        return false;
      }
    },
  });
  MutationTrend.add(Date.now() - startedAt);
  sleep(0.2);
}
