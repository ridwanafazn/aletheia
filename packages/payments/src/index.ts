import { randomUUID } from "node:crypto";

import type {
  PaymentEntityType,
  PaymentIntent,
  PaymentProviderName,
  PaymentWebhookEvent,
} from "@aletheia/shared-contracts";
import { PaymentWebhookEventSchema } from "@aletheia/shared-contracts";

export interface CreatePaymentInput {
  tenantId: string;
  entityType: PaymentEntityType;
  entityId: string;
  provider: PaymentProviderName;
  amount: string;
  idempotencyKey: string;
  requestedBy: string;
  approvedBy: string;
  metadata?: Record<string, string>;
}

export interface PaymentWebhookInput {
  signature: string;
  body: unknown;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;
  getPayment(reference: string): Promise<PaymentIntent>;
  reversePayment(reference: string, reason: string): Promise<PaymentIntent>;
  parseWebhook(input: PaymentWebhookInput): Promise<PaymentWebhookEvent>;
}

export class PaymentConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PaymentConflictError";
  }
}

export class PaymentNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PaymentNotFoundError";
  }
}

export class PaymentStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PaymentStateError";
  }
}

export interface MockPaymentProviderOptions {
  autoComplete?: boolean;
  now?: () => Date;
}

export class MockPaymentProvider implements PaymentProvider {
  public readonly name = "MOCK" as const;

  private readonly autoComplete: boolean;
  private readonly now: () => Date;
  private readonly payments = new Map<string, PaymentIntent>();
  private readonly byIdempotency = new Map<string, string>();
  private readonly byEntity = new Map<string, string>();

  public constructor(options: MockPaymentProviderOptions = {}) {
    this.autoComplete = options.autoComplete ?? false;
    this.now = options.now ?? (() => new Date());
  }

  public async createPayment(input: CreatePaymentInput): Promise<PaymentIntent> {
    const existingReference = this.byIdempotency.get(input.idempotencyKey);
    if (existingReference !== undefined) {
      const existing = this.payments.get(existingReference);
      if (existing !== undefined) {
        return { ...existing };
      }
    }

    const entityKey = `${input.entityType}:${input.entityId}`;
    if (this.byEntity.has(entityKey)) {
      throw new PaymentConflictError("Payment aktif atau lunas sudah ada untuk entity ini");
    }

    const id = randomUUID();
    const timestamp = this.now().toISOString();
    const status = this.autoComplete ? "PAID" : "PROCESSING";
    const payment: PaymentIntent = {
      id,
      tenant_id: input.tenantId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      provider: this.name,
      provider_reference: `MOCK-${id}`,
      amount: input.amount,
      status,
      idempotency_key: input.idempotencyKey,
      attempt_no: 1,
      requested_by: input.requestedBy,
      approved_by: input.approvedBy,
      requested_at: timestamp,
      paid_at: status === "PAID" ? timestamp : null,
      failure_reason: null,
    };

    this.payments.set(id, payment);
    this.byIdempotency.set(input.idempotencyKey, id);
    this.byEntity.set(entityKey, id);

    return { ...payment };
  }

  public async getPayment(reference: string): Promise<PaymentIntent> {
    const payment = this.payments.get(reference) ?? this.findByReference(reference);
    if (payment === undefined) {
      throw new PaymentNotFoundError("Payment tidak ditemukan");
    }
    return { ...payment };
  }

  public async reversePayment(reference: string, reason: string): Promise<PaymentIntent> {
    const payment = this.payments.get(reference) ?? this.findByReference(reference);
    if (payment === undefined) {
      throw new PaymentNotFoundError("Payment tidak ditemukan");
    }
    if (payment.status !== "PAID") {
      throw new PaymentStateError("Hanya payment PAID yang dapat di-reverse");
    }

    const updated: PaymentIntent = {
      ...payment,
      status: "REVERSED",
      failure_reason: reason,
    };

    this.payments.set(payment.id, updated);
    this.byEntity.delete(`${payment.entity_type}:${payment.entity_id}`);

    return { ...updated };
  }

  public async parseWebhook(input: PaymentWebhookInput): Promise<PaymentWebhookEvent> {
    if (input.signature.length === 0) {
      throw new PaymentStateError("Signature webhook tidak boleh kosong");
    }

    const event = PaymentWebhookEventSchema.parse(input.body);
    if (event.provider !== this.name) {
      throw new PaymentStateError("Provider webhook tidak cocok");
    }

    const payment = this.findByReference(event.provider_reference);
    if (payment === undefined) {
      throw new PaymentNotFoundError("Payment untuk webhook tidak ditemukan");
    }

    const paidAt = event.status === "PAID" ? this.now().toISOString() : payment.paid_at;
    const updated: PaymentIntent = {
      ...payment,
      status: event.status,
      paid_at: paidAt,
      failure_reason: event.status === "FAILED" ? "Provider melaporkan kegagalan" : null,
    };

    this.payments.set(payment.id, updated);
    if (event.status === "FAILED" || event.status === "REVERSED") {
      this.byEntity.delete(`${payment.entity_type}:${payment.entity_id}`);
    }

    return event;
  }

  private findByReference(reference: string): PaymentIntent | undefined {
    for (const payment of this.payments.values()) {
      if (payment.provider_reference === reference) {
        return payment;
      }
    }
    return undefined;
  }
}
