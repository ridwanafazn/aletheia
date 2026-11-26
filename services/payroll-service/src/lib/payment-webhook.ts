import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config.js";
import { stableStringify } from "./stable-json.js";

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
