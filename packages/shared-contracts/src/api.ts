import { z } from "zod";

import type { ErrorCode } from "./errors.js";
import { ApiErrorSchema } from "./errors.js";
import { CursorSchema, UuidSchema } from "./primitives.js";

export const ApiMetaSchema = z
  .object({
    next_cursor: CursorSchema.nullable(),
    has_more: z.boolean(),
  })
  .strict();
export type ApiMeta = z.infer<typeof ApiMetaSchema>;

export interface ApiSuccess<T> {
  success: true;
  correlation_id: string;
  data: T;
  meta?: ApiMeta;
  error: null;
}

export interface ApiFailure {
  success: false;
  correlation_id: string;
  data: null;
  meta?: ApiMeta | null;
  error: {
    code: ErrorCode;
    message: string;
    details?: Array<{ path: string; message: string }>;
    correlation_id: string;
    retryable: boolean;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function apiSuccessSchema<T extends z.ZodType>(data: T) {
  return z
    .object({
      success: z.literal(true),
      correlation_id: UuidSchema,
      data,
      meta: ApiMetaSchema.optional(),
      error: z.null(),
    })
    .strict();
}

export const apiFailureSchema = z
  .object({
    success: z.literal(false),
    correlation_id: UuidSchema,
    data: z.null(),
    meta: ApiMetaSchema.nullable().optional(),
    error: ApiErrorSchema,
  })
  .strict();

export function apiResponseSchema<T extends z.ZodType>(data: T) {
  return z.union([apiSuccessSchema(data), apiFailureSchema]);
}

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z
    .object({
      items: z.array(item),
      meta: ApiMetaSchema,
    })
    .strict();
}

export type Paginated<T> = {
  items: T[];
  meta: ApiMeta;
};
