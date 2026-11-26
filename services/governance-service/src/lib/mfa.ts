import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { generateSecret, generateSync, generateURI, verifySync } from "otplib";

import { env } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  if (env.MFA_ENCRYPTION_KEY !== undefined) {
    const key = Buffer.from(env.MFA_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) {
      throw new Error("MFA_ENCRYPTION_KEY harus berupa 32 byte base64");
    }
    return key;
  }
  if (env.IS_PRODUCTION) {
    throw new Error("MFA_ENCRYPTION_KEY wajib diisi di production");
  }
  return createHash("sha256").update(env.INTERNAL_GATEWAY_SECRET).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [ivBase64, tagBase64, encryptedBase64] = payload.split(".");
  if (ivBase64 === undefined || tagBase64 === undefined || encryptedBase64 === undefined) {
    throw new Error("Format secret MFA tidak valid");
  }
  const key = getEncryptionKey();
  const tag = Buffer.from(tagBase64, "base64");
  if (tag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Panjang authentication tag MFA tidak valid");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivBase64, "base64"), {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function createMfaSecret(): string {
  return generateSecret();
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  return generateURI({
    issuer: "Aletheia",
    label: email,
    secret,
  });
}

export function verifyTotp(secret: string, token: string): boolean {
  return verifySync({ secret, token }).valid;
}

export function createRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => randomBytes(5).toString("hex").toUpperCase());
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateTotpForTest(secret: string): string {
  return generateSync({ secret });
}
