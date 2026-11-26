import { z } from "zod";

import {
  PaymentEntityTypeSchema,
  PaymentProviderNameSchema,
  PaymentStatusSchema,
} from "./enums.js";
import { IsoDateTimeSchema, MoneySchema, UuidSchema } from "./primitives.js";

export const PaymentIntentSchema = z
  .object({
    id: UuidSchema,
    tenant_id: UuidSchema,
    entity_type: PaymentEntityTypeSchema,
    entity_id: UuidSchema,
    provider: PaymentProviderNameSchema,
    provider_reference: z.string().nullable(),
    amount: MoneySchema,
    status: PaymentStatusSchema,
    idempotency_key: z.string().min(8).max(128),
    attempt_no: z.number().int().positive(),
    requested_by: UuidSchema,
    approved_by: UuidSchema,
    requested_at: IsoDateTimeSchema,
    paid_at: IsoDateTimeSchema.nullable(),
    failure_reason: z.string().nullable(),
  })
  .strict();
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;

export const CreatePaymentRequestSchema = z
  .object({
    entity_type: PaymentEntityTypeSchema,
    entity_id: UuidSchema,
    provider: PaymentProviderNameSchema,
    amount: MoneySchema,
    idempotency_key: z.string().min(8).max(128),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

export const PaymentWebhookEventSchema = z
  .object({
    event_id: z.string().min(1).max(128),
    event_type: z.enum(["PAYMENT_PAID", "PAYMENT_FAILED", "PAYMENT_REVERSED"]),
    provider: PaymentProviderNameSchema,
    provider_reference: z.string().min(1).max(80),
    status: PaymentStatusSchema,
    amount: MoneySchema,
    occurred_at: IsoDateTimeSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type PaymentWebhookEvent = z.infer<typeof PaymentWebhookEventSchema>;

export const PaymentWebhookRequestSchema = z
  .object({
    signature: z.string().min(1),
    body: z.unknown(),
  })
  .strict();
export type PaymentWebhookRequest = z.infer<typeof PaymentWebhookRequestSchema>;

export const PaymentWebhookAckSchema = z.object({ received: z.boolean() }).strict();
export type PaymentWebhookAck = z.infer<typeof PaymentWebhookAckSchema>;
