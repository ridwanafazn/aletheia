import { createHash, randomBytes } from "node:crypto";

import type { CookieOptions, Response } from "express";

import { env } from "../config.js";

export const REFRESH_COOKIE_NAME = "aletheia_refresh";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(`${env.REFRESH_TOKEN_PEPPER}:${token}`).digest("hex");
}

export function hashIp(ip: string | undefined): string | null {
  if (ip === undefined || ip.length === 0) {
    return null;
  }
  return createHash("sha256").update(`${env.REFRESH_TOKEN_PEPPER}:${ip}`).digest("hex");
}

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}

export function setRefreshCookie(response: Response, token: string): void {
  response.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

export function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
  });
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000);
}
