import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const headerValue = request.header("x-correlation-id");
  const correlationId =
    headerValue !== undefined && headerValue.length > 0 ? headerValue : randomUUID();
  request.correlationId = correlationId;
  response.locals.correlationId = correlationId;
  response.setHeader("x-correlation-id", correlationId);
  next();
}
