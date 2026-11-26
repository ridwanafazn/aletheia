import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const headers = readFileSync(new URL("../../../public/_headers", import.meta.url), "utf8");

describe("static security headers", () => {
  it("memuat CSP tanpa unsafe-eval dan frame-ancestors none", () => {
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).not.toContain("unsafe-eval");
    expect(headers).not.toContain("default-src *");
  });

  it("memuat HSTS, nosniff, dan permissions policy", () => {
    expect(headers).toContain("Strict-Transport-Security: max-age=31536000");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("Referrer-Policy: no-referrer");
    expect(headers).toContain("Permissions-Policy:");
  });
});
