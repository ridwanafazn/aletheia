import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { ApiError, zodDetails } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function notFoundHandler(request: Request, _response: Response, next: NextFunction): void {
  next(ApiError.notFound(`Endpoint ${request.method} ${request.path} tidak ditemukan`));
}

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
): void {
  const correlationId = request.correlationId ?? response.locals.correlationId;

  if (error instanceof ApiError) {
    response.status(error.status).json({
      success: false,
      correlation_id: correlationId,
      data: null,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
        correlation_id: correlationId,
        retryable: error.retryable,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    const details = zodDetails(error);
    response.status(400).json({
      success: false,
      correlation_id: correlationId,
      data: null,
      error: {
        code: "ERR_VALIDATION_FAILED",
        message: "Validasi gagal",
        details,
        correlation_id: correlationId,
        retryable: false,
      },
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({
      success: false,
      correlation_id: correlationId,
      data: null,
      error: {
        code: "ERR_VALIDATION_FAILED",
        message: "Body JSON tidak valid",
        correlation_id: correlationId,
        retryable: false,
      },
    });
    return;
  }

  logger.error(
    {
      correlation_id: correlationId,
      method: request.method,
      path: request.path,
      error: error instanceof Error ? error.message : "unknown",
    },
    "unhandled request error",
  );

  response.status(500).json({
    success: false,
    correlation_id: correlationId,
    data: null,
    error: {
      code: "ERR_INTERNAL_ERROR",
      message: "Kesalahan internal",
      correlation_id: correlationId,
      retryable: false,
    },
  });
}
