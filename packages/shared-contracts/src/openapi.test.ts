import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./openapi.js";

describe("OpenAPI document", () => {
  const document = buildOpenApiDocument();
  const schemas = (document.components as { schemas: Record<string, unknown> }).schemas;
  const paths = document.paths as Record<string, unknown>;

  it("memakai OpenAPI 3.1", () => {
    expect(document.openapi).toBe("3.1.0");
  });

  it("memuat path transaksional utama", () => {
    expect(paths["/api/v1/claims"]).toBeDefined();
    expect(paths["/api/v1/claims/{id}/decide"]).toBeDefined();
    expect(paths["/api/v1/payroll/batches/{id}/approve"]).toBeDefined();
  });

  it("memuat schema kebijakan dan payroll", () => {
    expect(schemas.ClaimsPolicy).toBeDefined();
    expect(schemas.PayrollPolicy).toBeDefined();
    expect(schemas.ClaimDetailEnvelope).toBeDefined();
    expect(schemas.PayrollBatchEnvelope).toBeDefined();
  });

  it("memuat security scheme bearer", () => {
    const components = document.components as {
      securitySchemes: Record<string, unknown>;
    };
    expect(components.securitySchemes.bearerAuth).toBeDefined();
  });
});

describe("GraphQL SDL", () => {
  const sdl = readFileSync(
    fileURLToPath(new URL("../graphql/schema.graphql", import.meta.url)),
    "utf8",
  );

  it("memuat Query dan tipe MIS", () => {
    expect(sdl).toContain("type Query");
    expect(sdl).toContain("type BranchKpiSummary");
    expect(sdl).toContain("type ClaimAuditDetail");
  });

  it("membuat field personel anomali nullable", () => {
    expect(sdl).toContain("matchedPersonnelCode: String\n");
    expect(sdl).not.toContain("matchedPersonnelCode: String!");
  });
});
