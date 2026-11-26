import { z } from "zod";

import { RoleSchema } from "./enums.js";
import { UuidSchema } from "./primitives.js";

export const UserSummarySchema = z
  .object({
    id: UuidSchema,
    tenant_id: UuidSchema,
    branch_id: UuidSchema,
    role: RoleSchema,
    full_name: z.string().min(2).max(120),
    email: z.string().email(),
  })
  .strict();
export type UserSummary = z.infer<typeof UserSummarySchema>;

export const LoginRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(12).max(256),
    mfa_code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z
  .object({
    access_token: z.string().min(20),
    token_type: z.literal("Bearer"),
    expires_in: z.number().int().positive(),
    user: UserSummarySchema,
  })
  .strict();
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshResponseSchema = z
  .object({
    access_token: z.string().min(20),
    token_type: z.literal("Bearer"),
    expires_in: z.number().int().positive(),
  })
  .strict();
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const MfaEnrollResponseSchema = z
  .object({
    secret: z.string().min(16),
    otpauth_url: z.string().url(),
    recovery_codes: z.array(z.string().min(8)).min(5).max(10),
  })
  .strict();
export type MfaEnrollResponse = z.infer<typeof MfaEnrollResponseSchema>;

export const MfaVerifyRequestSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();
export type MfaVerifyRequest = z.infer<typeof MfaVerifyRequestSchema>;

export const MfaRecoveryRequestSchema = z
  .object({
    recovery_code: z.string().min(8).max(64),
  })
  .strict();
export type MfaRecoveryRequest = z.infer<typeof MfaRecoveryRequestSchema>;

export const AuthContextSchema = z
  .object({
    user_id: UuidSchema,
    tenant_id: UuidSchema,
    branch_id: UuidSchema,
    role: RoleSchema,
    correlation_id: UuidSchema,
  })
  .strict();
export type AuthContext = z.infer<typeof AuthContextSchema>;
