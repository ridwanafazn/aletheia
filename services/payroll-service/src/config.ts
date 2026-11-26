import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: ".env", quiet: true });
loadEnv({ path: "../../.env", quiet: true });

const OptionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4003),
  DATABASE_URL: z.string().min(1).default("postgresql://aletheia:aletheia@localhost:5432/aletheia"),
  INTERNAL_GATEWAY_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16).optional(),
  ),
  GATEWAY_MAX_SKEW_SECONDS: z.coerce.number().int().positive().default(30),
  PII_PEPPER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16).optional(),
  ),
  QSTASH_URL: z.string().url().default("https://qstash.upstash.io"),
  QSTASH_TOKEN: OptionalString,
  WORKER_URL: z.string().url().default("http://analytics-worker-go:4004"),
  MOCK_PAYMENT_AUTO_COMPLETE: OptionalString,
  PAYMENT_WEBHOOK_SECRET: OptionalString,
  FILE_SIGNING_SECRET: OptionalString,
  CLOUDINARY_CLOUD_NAME: OptionalString,
  CLOUDINARY_API_KEY: OptionalString,
  CLOUDINARY_API_SECRET: OptionalString,
  CLOUDINARY_FOLDER_PREFIX: z.string().min(1).default("aletheia"),
  FILE_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  LOG_LEVEL: z.string().default("info"),
});

const parsed = EnvSchema.parse(process.env);

if (parsed.NODE_ENV === "production") {
  if (parsed.INTERNAL_GATEWAY_SECRET === undefined) {
    throw new Error("INTERNAL_GATEWAY_SECRET wajib diisi di production");
  }
  if ((process.env.DATABASE_URL_APP ?? "") === "") {
    throw new Error("DATABASE_URL_APP wajib diisi di production");
  }
  if (parsed.PII_PEPPER === undefined) {
    throw new Error("PII_PEPPER wajib diisi di production");
  }
  if (parsed.PAYMENT_WEBHOOK_SECRET === undefined) {
    throw new Error("PAYMENT_WEBHOOK_SECRET wajib diisi di production");
  }
  if (parsed.FILE_SIGNING_SECRET === undefined) {
    throw new Error("FILE_SIGNING_SECRET wajib diisi di production");
  }
  if (
    parsed.CLOUDINARY_CLOUD_NAME === undefined ||
    parsed.CLOUDINARY_API_KEY === undefined ||
    parsed.CLOUDINARY_API_SECRET === undefined
  ) {
    throw new Error("Konfigurasi Cloudinary wajib diisi di production");
  }
}

export const env = {
  ...parsed,
  INTERNAL_GATEWAY_SECRET: parsed.INTERNAL_GATEWAY_SECRET ?? "dev-only-internal-gateway-secret",
  PII_PEPPER: parsed.PII_PEPPER ?? "aletheia-demo-pepper",
  PAYMENT_WEBHOOK_SECRET: parsed.PAYMENT_WEBHOOK_SECRET ?? "dev-only-payment-webhook-secret",
  FILE_SIGNING_SECRET:
    parsed.FILE_SIGNING_SECRET ?? parsed.INTERNAL_GATEWAY_SECRET ?? "dev-only-file-signing-secret",
  CLOUDINARY_CLOUD_NAME: parsed.CLOUDINARY_CLOUD_NAME ?? "aletheia-demo",
  CLOUDINARY_API_KEY: parsed.CLOUDINARY_API_KEY ?? "demo",
  CLOUDINARY_API_SECRET: parsed.CLOUDINARY_API_SECRET ?? "dev-only-cloudinary-secret",
  CLOUDINARY_FOLDER_PREFIX: parsed.CLOUDINARY_FOLDER_PREFIX,
  FILE_URL_TTL_SECONDS: parsed.FILE_URL_TTL_SECONDS,
  MOCK_PAYMENT_AUTO_COMPLETE:
    parsed.MOCK_PAYMENT_AUTO_COMPLETE === undefined
      ? parsed.NODE_ENV !== "production"
      : parsed.MOCK_PAYMENT_AUTO_COMPLETE === "true",
  IS_PRODUCTION: parsed.NODE_ENV === "production",
};
