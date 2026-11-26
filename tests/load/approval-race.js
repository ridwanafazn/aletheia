import http from "k6/http";
import { check, fail } from "k6";
import { Counter, Trend } from "k6/metrics";

import { authHeaders, BASE_URL, login, post, USERS, uuid } from "./lib/client.js";

export const options = {
  scenarios: {
    approval_race: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 20,
      maxDuration: "10m",
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    race_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.01"],
  },
};

const RaceSuccess = new Counter("race_success");
const RaceConflict = new Counter("race_conflict");
const RaceOther = new Counter("race_other");
const RaceDuration = new Trend("race_duration");

function claimPayload(index) {
  const suffix = String(index).slice(-12).padStart(12, "0");
  return {
    claimant_name: `Race Claimant ${index}`,
    claimant_nik: `3299${suffix}`,
    claimant_bank_account: `9900${suffix}`,
    claim_category: "HEALTH",
    requested_amount: "1500000.00",
    documents: [
      {
        document_type: "IDENTITY_CARD",
        cloudinary_public_id: `aletheia/race/identity-${index}`,
        secure_url: `https://res.cloudinary.com/aletheia-demo/image/upload/identity-${index}.pdf`,
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      },
      {
        document_type: "MEDICAL_INVOICE",
        cloudinary_public_id: `aletheia/race/invoice-${index}`,
        secure_url: `https://res.cloudinary.com/aletheia-demo/image/upload/invoice-${index}.pdf`,
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      },
    ],
  };
}

export function setup() {
  const officer = login(USERS.officer);
  const manager = login(USERS.manager);
  const claims = [];

  for (let index = 0; index < 20; index += 1) {
    const created = post(
      "/api/v1/claims",
      claimPayload(`${Date.now()}${index}`),
      officer.token,
      "setup-create",
      `race-setup-${index}-${uuid()}`.slice(0, 64),
    );
    if (created.status !== 201) {
      fail(`setup create gagal: ${created.status} ${created.body}`);
    }
    const claimId = JSON.parse(created.body).data.id;
    const submitted = post(
      `/api/v1/claims/${claimId}/submit`,
      {},
      officer.token,
      "setup-submit",
      undefined,
    );
    if (submitted.status !== 200) {
      fail(`setup submit gagal: ${submitted.status} ${submitted.body}`);
    }
    claims.push(claimId);
  }

  return { claims, managerToken: manager.token };
}

export default function (data) {
  const claimId = data.claims[__ITER % data.claims.length];
  const startedAt = Date.now();
  const requests = Array.from({ length: 5 }, (_, index) => [
    "POST",
    `${BASE_URL}/api/v1/claims/${claimId}/decide`,
    JSON.stringify({
      decision: "APPROVED",
      approved_amount: "1500000.00",
      reason_notes: `Load race approval ${index}`,
    }),
    {
      headers: {
        ...authHeaders(data.managerToken),
        "idempotency-key": `race-${__ITER}-${index}-${uuid()}`.slice(0, 64),
      },
      tags: { name: "approval-race" },
      timeout: "10s",
      responseCallback: http.expectedStatuses(200, 409),
    },
  ]);

  const responses = http.batch(requests);
  let success = 0;
  let conflict = 0;
  let other = 0;
  for (const response of responses) {
    if (response.status === 200) {
      success += 1;
    } else if (response.status === 409) {
      conflict += 1;
    } else {
      other += 1;
    }
  }
  RaceSuccess.add(success);
  RaceConflict.add(conflict);
  RaceOther.add(other);
  RaceDuration.add(Date.now() - startedAt);

  check(responses, {
    "tepat satu approval menang": () => success === 1,
    "empat approval kalah 409": () => conflict === 4,
    "tidak ada respons tak terduga": () => other === 0,
  });
}
