import type { NextFunction, Request, Response } from "express";

import { RoleSchema, UuidSchema, type Role } from "@aletheia/shared-contracts";

import { env } from "../config.js";
import { ApiError } from "../lib/errors.js";
import { computeBodySha256, verifyGatewaySignature } from "../lib/hmac.js";

const PUBLIC_PATHS = new Set(["/api/v1/auth/login", "/api/v1/auth/refresh"]);

export function gatewayAuth(request: Request, _response: Response, next: NextFunction): void {
  if (request.path === "/healthz" || request.path === "/readyz") {
    next();
    return;
  }

  const userId = request.header("x-user-id");
  const role = request.header("x-user-role");
  const branchId = request.header("x-branch-id");
  const tenantId = request.header("x-tenant-id");
  const timestamp = request.header("x-gateway-timestamp");
  const requestMethod = request.header("x-request-method");
  const requestPath = request.header("x-request-path");
  const bodySha256 = request.header("x-body-sha256");
  const signature = request.header("x-gateway-signature");

  if (
    userId === undefined ||
    role === undefined ||
    branchId === undefined ||
    tenantId === undefined ||
    timestamp === undefined ||
    requestMethod === undefined ||
    requestPath === undefined ||
    bodySha256 === undefined ||
    signature === undefined
  ) {
    next(ApiError.unauthorized("Header gateway tidak lengkap"));
    return;
  }

  if (
    !UuidSchema.safeParse(userId).success ||
    !UuidSchema.safeParse(branchId).success ||
    !UuidSchema.safeParse(tenantId).success
  ) {
    next(ApiError.unauthorized("Identitas gateway tidak valid"));
    return;
  }

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) {
    next(ApiError.unauthorized("Timestamp gateway tidak valid"));
    return;
  }

  const skewSeconds = Math.abs(Date.now() - timestampNumber) / 1000;
  if (skewSeconds > env.GATEWAY_MAX_SKEW_SECONDS) {
    next(ApiError.unauthorized("Timestamp gateway di luar batas"));
    return;
  }

  const actualPath = request.originalUrl.split("?")[0] ?? request.path;
  if (requestMethod.toUpperCase() !== request.method.toUpperCase() || requestPath !== actualPath) {
    next(ApiError.unauthorized("Method atau path gateway tidak cocok"));
    return;
  }

  const actualBodyHash = computeBodySha256(request.rawBody);
  if (actualBodyHash !== bodySha256.toLowerCase()) {
    next(ApiError.unauthorized("Body hash tidak cocok"));
    return;
  }

  const validSignature = verifyGatewaySignature(
    {
      userId,
      role,
      branchId,
      tenantId,
      timestamp,
      requestMethod,
      requestPath,
      bodySha256,
      signature,
    },
    env.INTERNAL_GATEWAY_SECRET,
  );

  if (!validSignature) {
    next(ApiError.unauthorized("Signature gateway tidak valid"));
    return;
  }

  if (role === "PUBLIC") {
    if (!PUBLIC_PATHS.has(actualPath)) {
      next(ApiError.unauthorized("Identitas publik hanya untuk endpoint autentikasi"));
      return;
    }
  } else if (!RoleSchema.safeParse(role).success) {
    next(ApiError.unauthorized("Role gateway tidak dikenal"));
    return;
  }

  request.auth = {
    userId,
    role: role as Role | "PUBLIC",
    branchId,
    tenantId,
    correlationId: request.correlationId,
  };
  next();
}
