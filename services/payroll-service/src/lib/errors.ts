import type { ErrorCode } from "@aletheia/shared-contracts";
import type { z } from "zod";

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details: ApiErrorDetail[] | undefined;
  public readonly retryable: boolean;

  public constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: ApiErrorDetail[],
    retryable = false,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  public static unauthorized(message = "Autentikasi diperlukan"): ApiError {
    return new ApiError(401, "ERR_UNAUTHORIZED_ACCESS", message);
  }

  public static forbidden(message = "Tidak berwenang"): ApiError {
    return new ApiError(403, "ERR_RBAC_FORBIDDEN", message);
  }

  public static notFound(message = "Resource tidak ditemukan"): ApiError {
    return new ApiError(404, "ERR_NOT_FOUND", message);
  }

  public static conflict(code: ErrorCode, message: string): ApiError {
    return new ApiError(409, code, message);
  }

  public static validation(details: ApiErrorDetail[]): ApiError {
    return new ApiError(400, "ERR_VALIDATION_FAILED", "Validasi gagal", details);
  }

  public static policyViolation(message: string): ApiError {
    return new ApiError(422, "ERR_POLICY_RULE_VIOLATION", message);
  }
}

export function zodDetails(error: z.ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "_root",
    message: issue.message,
  }));
}
