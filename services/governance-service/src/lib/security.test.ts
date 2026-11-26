import { describe, expect, it } from "vitest";

import { computeBodySha256, signGatewayHeaders, verifyGatewaySignature } from "./hmac.js";
import { decodeCursor, encodeCursor } from "./pagination.js";
import { stableStringify } from "./stable-json.js";

const secret = "test-internal-gateway-secret";

describe("gateway HMAC", () => {
  it("menandatangani dan memverifikasi header", () => {
    const input = {
      userId: "019361a2-7c00-7000-8000-000000000001",
      role: "COMPLIANCE_ADMIN",
      branchId: "019361a2-7c00-7000-8000-000000000002",
      tenantId: "019361a2-7c00-7000-8000-000000000003",
      timestamp: String(Date.now()),
      requestMethod: "POST",
      requestPath: "/api/v1/policies",
      bodySha256: computeBodySha256(Buffer.from('{"a":1}')),
    };
    const signature = signGatewayHeaders(input, secret);
    expect(verifyGatewaySignature({ ...input, signature }, secret)).toBe(true);
  });

  it("menolak signature yang diubah", () => {
    const input = {
      userId: "019361a2-7c00-7000-8000-000000000001",
      role: "COMPLIANCE_ADMIN",
      branchId: "019361a2-7c00-7000-8000-000000000002",
      tenantId: "019361a2-7c00-7000-8000-000000000003",
      timestamp: String(Date.now()),
      requestMethod: "POST",
      requestPath: "/api/v1/policies",
      bodySha256: computeBodySha256(Buffer.from("{}")),
    };
    const signature = signGatewayHeaders(input, secret);
    expect(
      verifyGatewaySignature({ ...input, signature: "0".repeat(signature.length) }, secret),
    ).toBe(false);
  });
});

describe("stableStringify", () => {
  it("mengurutkan key secara deterministik", () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });
});

describe("cursor pagination", () => {
  it("encode dan decode cursor", () => {
    const cursor = encodeCursor("2026-11-25T10:00:00.000Z", "019361a2-7c00-7000-8000-000000000001");
    expect(decodeCursor(cursor)).toEqual({
      createdAt: "2026-11-25T10:00:00.000Z",
      id: "019361a2-7c00-7000-8000-000000000001",
    });
  });

  it("menolak cursor rusak", () => {
    expect(() => decodeCursor("bukan-cursor")).toThrow(/Cursor/);
  });
});
