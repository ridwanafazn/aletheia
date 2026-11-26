import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  computeBodySha256,
  sha256Hex,
  signGatewayHeaders,
  signaturePayload,
  verifyGatewaySignature,
  type GatewayHeaders,
} from "./hmac.js";
import { signAccessToken, verifyAccessToken } from "./jwt.js";
import {
  buildOtpAuthUrl,
  createMfaSecret,
  createRecoveryCodes,
  decryptSecret,
  encryptSecret,
  generateTotpForTest,
  hashRecoveryCode,
  verifyTotp,
} from "./mfa.js";
import { decodeCursor, encodeCursor } from "./pagination.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  clearRefreshCookie,
  createRefreshToken,
  hashIp,
  hashRefreshToken,
  refreshCookieOptions,
  refreshExpiry,
  setRefreshCookie,
} from "./refresh-token.js";
import { stableStringify } from "./stable-json.js";

const USER = "019361a2-7c00-7000-8000-000000000001";
const TENANT = "019361a2-7c00-7000-8000-000000000002";
const BRANCH = "019361a2-7c00-7000-8000-000000000003";

describe("jwt access token", () => {
  it("menandatangani dan memverifikasi klaim akses", async () => {
    const signed = await signAccessToken(USER, {
      tid: TENANT,
      role: "CLAIMS_OFFICER",
      branch_id: BRANCH,
    });
    expect(signed.expiresIn).toBe(900);

    const payload = await verifyAccessToken(signed.token);
    expect(payload.sub).toBe(USER);
    expect(payload.tid).toBe(TENANT);
    expect(payload.role).toBe("CLAIMS_OFFICER");
    expect(payload.branch_id).toBe(BRANCH);
    expect(payload.iss).toBe("aletheia");
    expect(payload.aud).toBe("aletheia-web");
  });

  it("menolak token yang diubah", async () => {
    const signed = await signAccessToken(USER, {
      tid: TENANT,
      role: "MIS_ANALYST",
      branch_id: BRANCH,
    });
    await expect(verifyAccessToken(`${signed.token}x`)).rejects.toThrow();
  });
});

describe("mfa", () => {
  it("mengenkripsi dan mendekripsi secret", () => {
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(encrypted.split(".")).toHaveLength(3);
    expect(decryptSecret(encrypted)).toBe("JBSWY3DPEHPK3PXP");
    expect(() => decryptSecret("bukan-format")).toThrow(/tidak valid/);
    expect(() => decryptSecret("a.b.c")).toThrow();
    expect(() =>
      decryptSecret(`${encrypted.split(".")[0]}.short.${encrypted.split(".")[2]}`),
    ).toThrow(/tag/);
  });

  it("membuat secret, otpauth, TOTP, dan recovery code", () => {
    const secret = createMfaSecret();
    expect(secret.length).toBeGreaterThan(10);
    expect(buildOtpAuthUrl("user@aletheia.id", secret)).toContain("otpauth://totp/");
    expect(verifyTotp(secret, generateTotpForTest(secret))).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);

    const codes = createRecoveryCodes(3);
    expect(codes).toHaveLength(3);
    expect(codes[0]).toMatch(/^[A-F0-9]{10}$/);
    expect(hashRecoveryCode(codes[0]!)).toHaveLength(64);
  });
});

describe("password", () => {
  it("menghash dan memverifikasi password", async () => {
    const hashed = await hashPassword("AletheiaDemo!2026");
    expect(hashed).not.toContain("AletheiaDemo");
    await expect(verifyPassword(hashed, "AletheiaDemo!2026")).resolves.toBe(true);
    await expect(verifyPassword(hashed, "salah")).resolves.toBe(false);
    await expect(verifyPassword("bukan-hash", "apa saja")).resolves.toBe(false);
  });
});

describe("refresh token", () => {
  it("membuat token acak dan hash yang deterministik", () => {
    const first = createRefreshToken();
    const second = createRefreshToken();
    expect(first).not.toBe(second);
    expect(first).toHaveLength(64);
    expect(hashRefreshToken(first)).toBe(hashRefreshToken(first));
    expect(hashRefreshToken(first)).not.toBe(hashRefreshToken(second));
    expect(hashRefreshToken(first)).toHaveLength(64);
  });

  it("membuat opsi cookie dan helper response", () => {
    expect(refreshCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
    });
    const response = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as Response;
    setRefreshCookie(response, "token");
    expect(response.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, "token", expect.any(Object));
    clearRefreshCookie(response);
    expect(response.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      expect.objectContaining({ path: REFRESH_COOKIE_PATH }),
    );
  });

  it("menghash IP dan menghitung expiry", () => {
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp("")).toBeNull();
    expect(hashIp("127.0.0.1")).toHaveLength(64);
    expect(hashIp("127.0.0.1")).toBe(hashIp("127.0.0.1"));
    expect(refreshExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});

describe("gateway hmac", () => {
  const base: Omit<GatewayHeaders, "signature"> = {
    userId: USER,
    role: "CLAIMS_OFFICER",
    branchId: BRANCH,
    tenantId: TENANT,
    timestamp: "1795670000000",
    requestMethod: "POST",
    requestPath: "/api/v1/claims",
    bodySha256: sha256Hex("{}"),
  };

  it("menghitung body hash dan payload signature", () => {
    expect(computeBodySha256(undefined)).toBe(sha256Hex(Buffer.alloc(0)));
    expect(computeBodySha256(Buffer.from("{}"))).toBe(sha256Hex("{}"));
    expect(signaturePayload(base)).toContain("POST:/api/v1/claims:");
  });

  it("memverifikasi signature valid dan menolak variasi salah", () => {
    const signature = signGatewayHeaders(base, "secret");
    expect(verifyGatewaySignature({ ...base, signature }, "secret")).toBe(true);
    expect(verifyGatewaySignature({ ...base, signature: signature.toUpperCase() }, "secret")).toBe(
      true,
    );
    expect(verifyGatewaySignature({ ...base, signature: "short" }, "secret")).toBe(false);
    expect(verifyGatewaySignature({ ...base, signature }, "secret-lain")).toBe(false);
  });
});

describe("pagination dan stable json governance", () => {
  it("roundtrip cursor dan menolak input rusak", () => {
    const cursor = encodeCursor(new Date("2026-11-01T00:00:00.000Z"), "5");
    expect(decodeCursor(cursor)).toEqual({ createdAt: "2026-11-01T00:00:00.000Z", id: "5" });
    expect(decodeCursor(encodeCursor("2026-11-01T00:00:00.000Z", "6")).id).toBe("6");
    expect(() => decodeCursor("rusak")).toThrow(/tidak valid/);
  });

  it("menstabilkan JSON", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(stableStringify([{ b: 2, a: 1 }])).toBe('[{"a":1,"b":2}]');
    expect(stableStringify(null)).toBe("null");
  });
});
