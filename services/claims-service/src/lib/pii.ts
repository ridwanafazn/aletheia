import { createHash } from "node:crypto";

import { env } from "../config.js";

function pepperHash(value: string): string {
  return createHash("sha256").update(`${env.PII_PEPPER}:${value}`).digest("hex");
}

export function hashNik(nik: string): string {
  return pepperHash(nik);
}

export function hashBankAccount(account: string): string {
  return pepperHash(account);
}

export function maskNik(nik: string): string {
  return `${nik.slice(0, 4)}${"*".repeat(8)}${nik.slice(-4)}`;
}

export function maskBankAccount(account: string): string {
  return `******${account.slice(-4)}`;
}
