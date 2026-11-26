import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      INTERNAL_GATEWAY_SECRET: "test-internal-gateway-secret",
      REFRESH_TOKEN_PEPPER: "test-refresh-pepper",
      MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      JWT_ISSUER: "aletheia",
      JWT_AUDIENCE: "aletheia-web",
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_SECONDS: "604800",
      GATEWAY_MAX_SKEW_SECONDS: "30",
      COOKIE_SECURE: "false",
    },
  },
});
