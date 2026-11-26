import crypto from "k6/crypto";
import http from "k6/http";
import { check, fail } from "k6";
import { Counter, Trend } from "k6/metrics";

import { authHeaders, BASE_URL, get, login, parseBody, post, USERS, uuid } from "./lib/client.js";

export const options = {
  vus: 1,
  iterations: 1,
  maxDuration: "5m",
  thresholds: {
    checks: ["rate>0.99"],
    webhook_duration: ["p(95)<1000"],
    webhook_ok: ["count==100"],
  },
};

const WebhookOk = new Counter("webhook_ok");
const WebhookDuration = new Trend("webhook_duration");
const WEBHOOK_SECRET = __ENV.PAYMENT_WEBHOOK_SECRET ?? "dev-only-payment-webhook-secret";

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function claimPayload() {
  const suffix = String(Date.now()).slice(-12);
  return {
    claimant_name: "Webhook Retry Claimant",
    claimant_nik: `3288${suffix}`,
    claimant_bank_account: `7700${suffix}`,
    claim_category: "HEALTH",
    requested_amount: "2000000.00",
    documents: [
      {
        document_type: "IDENTITY_CARD",
        cloudinary_public_id: "aletheia/webhook/identity",
        secure_url: "https://res.cloudinary.com/aletheia-demo/image/upload/identity.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      },
      {
        document_type: "MEDICAL_INVOICE",
        cloudinary_public_id: "aletheia/webhook/invoice",
        secure_url: "https://res.cloudinary.com/aletheia-demo/image/upload/invoice.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      },
    ],
  };
}

export function setup() {
  const officer = login(USERS.officer);
  const manager = login(USERS.manager);
  const finance = login(USERS.finance);

  const created = post(
    "/api/v1/claims",
    claimPayload(),
    officer.token,
    "setup-create",
    `webhook-setup-${uuid()}`.slice(0, 64),
  );
  if (created.status !== 201) {
    fail(`create gagal: ${created.status} ${created.body}`);
  }
  const claimId = parseBody(created).data.id;

  const submitted = post(`/api/v1/claims/${claimId}/submit`, {}, officer.token, "setup-submit");
  if (submitted.status !== 200) {
    fail(`submit gagal: ${submitted.status} ${submitted.body}`);
  }

  const decided = post(
    `/api/v1/claims/${claimId}/decide`,
    {
      decision: "APPROVED",
      approved_amount: "2000000.00",
      reason_notes: "Load test webhook retry",
    },
    manager.token,
    "setup-decide",
    `webhook-decide-${uuid()}`.slice(0, 64),
  );
  if (decided.status !== 200) {
    fail(`decide gagal: ${decided.status} ${decided.body}`);
  }

  const disbursed = post(
    `/api/v1/claims/${claimId}/disburse`,
    { provider: "MOCK" },
    finance.token,
    "setup-disburse",
    `webhook-disburse-${uuid()}`.slice(0, 64),
  );
  if (disbursed.status !== 201 && disbursed.status !== 202) {
    fail(`disburse gagal: ${disbursed.status} ${disbursed.body}`);
  }
  const payment = parseBody(disbursed).data;
  if (payment?.provider_reference === null || payment?.provider_reference === undefined) {
    fail(`provider reference tidak tersedia: ${disbursed.body}`);
  }

  return {
    claimId,
    financeToken: finance.token,
    providerReference: payment.provider_reference,
    amount: payment.amount,
  };
}

export default function (data) {
  const requests = Array.from({ length: 100 }, (_, index) => {
    const event = {
      event_id: `load-webhook-${index}-${uuid()}`,
      event_type: "PAYMENT_PAID",
      provider: "MOCK",
      provider_reference: data.providerReference,
      status: "PAID",
      amount: data.amount,
      occurred_at: new Date().toISOString(),
      payload: { source: "k6-payment-retry", duplicate: true },
    };
    const signature = crypto.hmac("sha256", WEBHOOK_SECRET, stableStringify(event), "hex");
    return [
      "POST",
      `${BASE_URL}/api/v1/claims/payments/webhook/MOCK`,
      JSON.stringify({ signature, body: event }),
      {
        headers: { "content-type": "application/json" },
        tags: { name: "payment-webhook" },
        timeout: "10s",
      },
    ];
  });

  const startedAt = Date.now();
  const responses = http.batch(requests);
  WebhookDuration.add(Date.now() - startedAt);
  let accepted = 0;
  for (const response of responses) {
    if (response.status === 200) {
      accepted += 1;
    }
  }
  WebhookOk.add(accepted);

  const detail = get(`/api/v1/claims/${data.claimId}`, data.financeToken, "payment-status");
  check(
    { accepted, detail },
    {
      "100 webhook diterima": (value) => value.accepted === 100,
      "klaim berstatus DISBURSED": (value) => {
        const body = parseBody(value.detail);
        return body?.data?.status === "DISBURSED";
      },
    },
  );
}
