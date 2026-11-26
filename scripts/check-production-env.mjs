import { readFileSync } from "node:fs";

const envPath = process.argv[2] ?? ".env.production.local";
const raw = readFileSync(envPath, "utf8");
const values = new Map();

for (const line of raw.split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (match === null) continue;
  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  values.set(match[1], value);
}

const required = [
  "DATABASE_URL",
  "DATABASE_URL_APP",
  "WORKER_DATABASE_URL",
  "APP_DB_PASSWORD",
  "JWT_PRIVATE_KEY",
  "JWT_PUBLIC_KEY",
  "REFRESH_TOKEN_PEPPER",
  "MFA_ENCRYPTION_KEY",
  "PII_PEPPER",
  "INTERNAL_GATEWAY_SECRET",
  "PAYMENT_WEBHOOK_SECRET",
  "FILE_SIGNING_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "WEB_ORIGIN",
];

const optional = [
  "REDIS_URL",
  "REDIS_TOKEN",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "WORKER_URL",
  "WORKER_PUBLIC_URL",
  "EDGE_URL",
];

const missing = required.filter((key) => (values.get(key) ?? "").length === 0);
const hasHost =
  (values.get("KOYEB_API_TOKEN") ?? "").length > 0 ||
  ((values.get("RENDER_API_KEY") ?? "").length > 0 &&
    (values.get("RENDER_OWNER_ID") ?? "").length > 0);
if (!hasHost) {
  missing.push("KOYEB_API_TOKEN atau RENDER_API_KEY + RENDER_OWNER_ID");
}

const invalid = [];
for (const key of ["DATABASE_URL", "DATABASE_URL_APP", "WORKER_DATABASE_URL"]) {
  const value = values.get(key) ?? "";
  if (value.length > 0 && !/^postgres(ql)?:\/\//.test(value)) {
    invalid.push(`${key} bukan URL PostgreSQL`);
  }
}
for (const key of ["WEB_ORIGIN", "UPSTASH_REDIS_REST_URL"]) {
  const value = values.get(key) ?? "";
  if (value.length > 0 && !/^https:\/\//.test(value)) {
    invalid.push(`${key} harus https`);
  }
}

const optionalMissing = optional.filter((key) => (values.get(key) ?? "").length === 0);

if (missing.length > 0 || invalid.length > 0) {
  console.error("Production env BELUM siap.");
  if (missing.length > 0) {
    console.error(`Missing: ${missing.join(", ")}`);
  }
  if (invalid.length > 0) {
    console.error(`Invalid: ${invalid.join(", ")}`);
  }
  if (optionalMissing.length > 0) {
    console.error(`Optional/empty: ${optionalMissing.join(", ")}`);
  }
  process.exit(1);
}

console.log("Production env siap untuk deployment.");
if (optionalMissing.length > 0) {
  console.log(`Optional/empty (isi setelah service deploy): ${optionalMissing.join(", ")}`);
}
