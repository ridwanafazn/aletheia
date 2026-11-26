import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      INTERNAL_GATEWAY_SECRET: "test-internal-gateway-secret",
      GATEWAY_MAX_SKEW_SECONDS: "30",
      PII_PEPPER: "test-pii-pepper-01",
      QSTASH_URL: "https://qstash.test",
      QSTASH_TOKEN: "test-qstash-token",
      WORKER_URL: "http://worker.test",
      MOCK_PAYMENT_AUTO_COMPLETE: "true",
      LOG_LEVEL: "silent",
    },
  },
});
