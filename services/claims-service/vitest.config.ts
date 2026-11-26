import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      INTERNAL_GATEWAY_SECRET: "test-internal-gateway-secret",
      GATEWAY_MAX_SKEW_SECONDS: "30",
      PII_PEPPER: "test-pii-pepper-01",
      CLOUDINARY_CLOUD_NAME: "aletheia-test",
      CLOUDINARY_API_KEY: "test-key",
      CLOUDINARY_API_SECRET: "test-cloudinary-secret",
      CLOUDINARY_FOLDER_PREFIX: "aletheia/claims",
      PAYMENT_WEBHOOK_SECRET: "test-payment-webhook-secret",
      MOCK_PAYMENT_AUTO_COMPLETE: "false",
      WORKER_URL: "http://localhost:4004",
      LOG_LEVEL: "silent",
    },
  },
});
