import { createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentProviderName } from "@aletheia/shared-contracts";
import { MockPaymentProvider, type PaymentProvider } from "@aletheia/payments";

import { env } from "../config.js";
import { ApiError } from "./errors.js";
import { stableStringify } from "./stable-json.js";

const mockProvider = new MockPaymentProvider({
  autoComplete: env.MOCK_PAYMENT_AUTO_COMPLETE,
});

export function getPaymentProvider(name: PaymentProviderName): PaymentProvider {
  if (name === "MOCK") {
    return mockProvider;
  }
  throw new ApiError(
    424,
    "ERR_PAYMENT_PROVIDER_FAILED",
    `Provider ${name} belum dikonfigurasi pada lingkungan ini`,
  );
}

export function signMockWebhook(body: unknown): string {
  return createHmac("sha256", env.PAYMENT_WEBHOOK_SECRET)
    .update(stableStringify(body))
    .digest("hex");
}

export function verifyMockWebhookSignature(body: unknown, signature: string): boolean {
  const expected = signMockWebhook(body);
  const received = signature.replace(/^sha256=/, "").toLowerCase();
  if (received.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
