import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const headerValue = request.header("x-correlation-id");
  const correlationId =
    headerValue !== undefined && UUID_PATTERN.test(headerValue) ? headerValue : randomUUID();
  request.correlationId = correlationId;
  response.locals.correlationId = correlationId;
  response.setHeader("x-correlation-id", correlationId);
  next();
}
