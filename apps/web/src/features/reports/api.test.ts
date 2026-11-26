import { describe, expect, it } from "vitest";

import { absoluteApiUrl } from "../../shared/api/client";

describe("absoluteApiUrl", () => {
  it("keeps an absolute URL unchanged", () => {
    expect(absoluteApiUrl("https://example.test/file.pdf")).toBe("https://example.test/file.pdf");
  });

  it("prefixes a relative API path", () => {
    expect(absoluteApiUrl("/api/v1/payroll-files/token")).toMatch(
      /\/api\/v1\/payroll-files\/token$/,
    );
  });
});
