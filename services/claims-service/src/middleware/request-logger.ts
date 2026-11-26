import { currentTraceFields } from "@aletheia/observability";
import type { NextFunction, Request, Response } from "express";

import { logger } from "../lib/logger.js";

export function requestLogger(request: Request, response: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  const traceFields = currentTraceFields();
  const path = request.originalUrl.split("?")[0] ?? request.path;
  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info(
      {
        ...traceFields,
        correlation_id: request.correlationId,
        method: request.method,
        path,
        status: response.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
        user_id: request.auth?.userId,
        tenant_id: request.auth?.tenantId,
      },
      "request completed",
    );
  });
  next();
}
