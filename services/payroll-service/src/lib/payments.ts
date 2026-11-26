import type { PaymentProviderName } from "@aletheia/shared-contracts";
import { MockPaymentProvider, type PaymentProvider } from "@aletheia/payments";

import { env } from "../config.js";
import { ApiError } from "./errors.js";

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
