import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: ".env", quiet: true });
loadEnv({ path: "../../.env", quiet: true });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  DATABASE_URL: z.string().min(1).default("postgresql://aletheia:aletheia@localhost:5432/aletheia"),
  INTERNAL_GATEWAY_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16).optional(),
  ),
  JWT_ISSUER: z.string().min(1).default("aletheia"),
  JWT_AUDIENCE: z.string().min(1).default("aletheia-web"),
  JWT_PRIVATE_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  JWT_PUBLIC_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  REFRESH_TOKEN_PEPPER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(8).optional(),
  ),
  MFA_ENCRYPTION_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  MFA_ENFORCED: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  COOKIE_SECURE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
  ),
  GATEWAY_MAX_SKEW_SECONDS: z.coerce.number().int().positive().default(30),
  QSTASH_URL: z.string().url().default("https://qstash.upstash.io"),
  QSTASH_TOKEN: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  WORKER_URL: z.string().url().default("http://analytics-worker-go:4004"),
  LOG_LEVEL: z.string().default("info"),
});

const parsed = EnvSchema.parse(process.env);

if (parsed.NODE_ENV === "production" && parsed.INTERNAL_GATEWAY_SECRET === undefined) {
  throw new Error("INTERNAL_GATEWAY_SECRET wajib diisi di production");
}

if (parsed.NODE_ENV === "production" && (process.env.DATABASE_URL ?? "") === "") {
  throw new Error("DATABASE_URL wajib diisi di production");
}

if (parsed.NODE_ENV === "production" && parsed.REFRESH_TOKEN_PEPPER === undefined) {
  throw new Error("REFRESH_TOKEN_PEPPER wajib diisi di production");
}

if (parsed.NODE_ENV === "production" && parsed.MFA_ENCRYPTION_KEY === undefined) {
  throw new Error("MFA_ENCRYPTION_KEY wajib diisi di production");
}

if (parsed.NODE_ENV === "production" && parsed.JWT_PRIVATE_KEY === undefined) {
  throw new Error("JWT_PRIVATE_KEY wajib diisi di production");
}

if ((parsed.JWT_PRIVATE_KEY === undefined) !== (parsed.JWT_PUBLIC_KEY === undefined)) {
  throw new Error("JWT_PRIVATE_KEY dan JWT_PUBLIC_KEY harus diisi bersama");
}

export const env = {
  ...parsed,
  INTERNAL_GATEWAY_SECRET: parsed.INTERNAL_GATEWAY_SECRET ?? "dev-only-internal-gateway-secret",
  REFRESH_TOKEN_PEPPER: parsed.REFRESH_TOKEN_PEPPER ?? "dev-only-refresh-pepper",
  COOKIE_SECURE: parsed.COOKIE_SECURE ?? parsed.NODE_ENV === "production",
  IS_PRODUCTION: parsed.NODE_ENV === "production",
};
