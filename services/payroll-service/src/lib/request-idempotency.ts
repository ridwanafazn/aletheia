import type { Request } from "express";

import { IdempotencyKeySchema } from "@aletheia/shared-contracts";

import { ApiError, zodDetails } from "./errors.js";
import { sha256Hex } from "./hmac.js";
import { stableStringify } from "./stable-json.js";

export function requireIdempotencyKey(request: Request): string {
  const header = request.header("idempotency-key");
  if (header === undefined || header.length === 0) {
    throw new ApiError(400, "ERR_VALIDATION_FAILED", "Header Idempotency-Key wajib diisi", [
      { path: "Idempotency-Key", message: "Header wajib diisi" },
    ]);
  }

  const parsed = IdempotencyKeySchema.safeParse(header);
  if (!parsed.success || parsed.data.length > 64) {
    throw new ApiError(
      400,
      "ERR_VALIDATION_FAILED",
      "Header Idempotency-Key tidak valid",
      parsed.success
        ? [{ path: "Idempotency-Key", message: "Maksimal 64 karakter" }]
        : zodDetails(parsed.error),
    );
  }
  return parsed.data;
}

export function idempotencyRequestHash(payload: unknown): string {
  return sha256Hex(stableStringify(payload));
}
