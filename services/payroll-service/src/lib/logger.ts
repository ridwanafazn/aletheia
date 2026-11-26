import { currentTraceFields } from "@aletheia/observability";
import pino from "pino";

import { env } from "../config.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "payroll-service",
    env: env.NODE_ENV,
  },
  mixin: () => currentTraceFields(),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "password_hash",
      "token",
      "access_token",
      "refresh_token",
      "mfa_secret",
      "mfa_secret_encrypted",
      "recovery_code",
      "nik",
      "bank_account",
      "secret",
    ],
    censor: "[REDACTED]",
  },
});
