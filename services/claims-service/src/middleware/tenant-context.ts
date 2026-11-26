import { runWithTenant } from "@aletheia/database";
import type { NextFunction, Request, Response } from "express";

export function tenantContext(request: Request, _response: Response, next: NextFunction): void {
  if (request.auth !== undefined && request.auth.role !== "PUBLIC") {
    runWithTenant(request.auth.tenantId, next);
    return;
  }
  next();
}
