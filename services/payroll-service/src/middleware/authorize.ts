import type { NextFunction, Request, Response } from "express";

import type { Role } from "@aletheia/shared-contracts";

import { ApiError } from "../lib/errors.js";

export function requireRoles(...roles: Role[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (request.auth === undefined || request.auth.role === "PUBLIC") {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(request.auth.role)) {
      next(ApiError.forbidden());
      return;
    }
    next();
  };
}

export function requireAuthenticated(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (request.auth === undefined || request.auth.role === "PUBLIC") {
    next(ApiError.unauthorized());
    return;
  }
  next();
}
