import { describe, expect, it } from "vitest";

import {
  MockPaymentProvider,
  PaymentConflictError,
  PaymentNotFoundError,
  PaymentStateError,
  type CreatePaymentInput,
} from "./index.js";

const tenantId = "019361a2-7c00-7000-8000-000000000001";
const entityId = "019361a2-7c00-7000-8000-000000000002";
const requestedBy = "019361a2-7c00-7000-8000-000000000003";
const approvedBy = "019361a2-7c00-7000-8000-000000000004";

function input(idempotencyKey: string): CreatePaymentInput {
  return {
    tenantId,
    entityType: "CLAIM",
    entityId,
    provider: "MOCK",
    amount: "18500000.00",
    idempotencyKey,
    requestedBy,
    approvedBy,
  };
}

describe("MockPaymentProvider", () => {
  it("mengembalikan payment yang sama untuk idempotency key yang sama", async () => {
    const provider = new MockPaymentProvider();
    const first = await provider.createPayment(input("idem-key-0001"));
    const second = await provider.createPayment(input("idem-key-0001"));

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("PROCESSING");
  });

  it("menolak idempotency key berbeda untuk entity yang sama", async () => {
    const provider = new MockPaymentProvider();
    await provider.createPayment(input("idem-key-0001"));

    await expect(provider.createPayment(input("idem-key-0002"))).rejects.toBeInstanceOf(
      PaymentConflictError,
    );
  });

  it("menghasilkan PAID saat autoComplete aktif", async () => {
    const provider = new MockPaymentProvider({ autoComplete: true });
    const payment = await provider.createPayment(input("idem-key-0003"));

    expect(payment.status).toBe("PAID");
    expect(payment.paid_at).not.toBeNull();
  });

  it("hanya mengizinkan reverse untuk payment PAID", async () => {
    const provider = new MockPaymentProvider();
    const payment = await provider.createPayment(input("idem-key-0004"));

    await expect(provider.reversePayment(payment.id, "Salah input")).rejects.toBeInstanceOf(
      PaymentStateError,
    );

    const paidProvider = new MockPaymentProvider({ autoComplete: true });
    const paid = await paidProvider.createPayment(input("idem-key-0005"));
    const reversed = await paidProvider.reversePayment(paid.id, "Salah input");

    expect(reversed.status).toBe("REVERSED");
  });

  it("memproses webhook PAID dan memperbarui status", async () => {
    const provider = new MockPaymentProvider({
      now: () => new Date("2026-11-25T10:00:00.000Z"),
    });
    const payment = await provider.createPayment(input("idem-key-0006"));

    const event = await provider.parseWebhook({
      signature: "mock-signature",
      body: {
        event_id: "evt-1",
        event_type: "PAYMENT_PAID",
        provider: "MOCK",
        provider_reference: payment.provider_reference,
        status: "PAID",
        amount: payment.amount,
        occurred_at: "2026-11-25T10:01:00.000Z",
        payload: { source: "test" },
      },
    });

    expect(event.status).toBe("PAID");
    const updated = await provider.getPayment(payment.id);
    expect(updated.status).toBe("PAID");
    expect(updated.paid_at).toBe("2026-11-25T10:00:00.000Z");
  });

  it("menolak webhook tanpa signature", async () => {
    const provider = new MockPaymentProvider();

    await expect(provider.parseWebhook({ signature: "", body: {} })).rejects.toBeInstanceOf(
      PaymentStateError,
    );
  });
});

describe("MockPaymentProvider tambahan", () => {
  it("mengambil payment berdasarkan id dan provider reference", async () => {
    const provider = new MockPaymentProvider();
    const payment = await provider.createPayment(input("idem-key-0007"));
    await expect(provider.getPayment(payment.id)).resolves.toMatchObject({ id: payment.id });
    await expect(provider.getPayment(payment.provider_reference)).resolves.toMatchObject({
      id: payment.id,
    });
    await expect(provider.getPayment("tidak-ada")).rejects.toBeInstanceOf(PaymentNotFoundError);
  });

  it("menolak reverse payment yang tidak ada", async () => {
    const provider = new MockPaymentProvider();
    await expect(provider.reversePayment("tidak-ada", "x")).rejects.toBeInstanceOf(
      PaymentNotFoundError,
    );
  });

  it("menolak webhook provider yang tidak cocok dan referensi tidak dikenal", async () => {
    const provider = new MockPaymentProvider();
    await expect(
      provider.parseWebhook({
        signature: "sig",
        body: {
          event_id: "evt-x",
          event_type: "PAYMENT_PAID",
          provider: "XENDIT",
          provider_reference: "MOCK-x",
          status: "PAID",
          amount: "1.00",
          occurred_at: "2026-11-25T10:00:00.000Z",
          payload: {},
        },
      }),
    ).rejects.toBeInstanceOf(PaymentStateError);

    await expect(
      provider.parseWebhook({
        signature: "sig",
        body: {
          event_id: "evt-y",
          event_type: "PAYMENT_PAID",
          provider: "MOCK",
          provider_reference: "MOCK-tidak-ada",
          status: "PAID",
          amount: "1.00",
          occurred_at: "2026-11-25T10:00:00.000Z",
          payload: {},
        },
      }),
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
  });

  it("memproses webhook FAILED dan REVERSED", async () => {
    const provider = new MockPaymentProvider({ autoComplete: true });
    const first = await provider.createPayment(input("idem-key-0008"));
    const failed = await provider.parseWebhook({
      signature: "sig",
      body: {
        event_id: "evt-failed",
        event_type: "PAYMENT_FAILED",
        provider: "MOCK",
        provider_reference: first.provider_reference,
        status: "FAILED",
        amount: first.amount,
        occurred_at: "2026-11-25T10:02:00.000Z",
        payload: {},
      },
    });
    expect(failed.status).toBe("FAILED");
    await expect(provider.getPayment(first.id)).resolves.toMatchObject({
      status: "FAILED",
      failure_reason: "Provider melaporkan kegagalan",
    });

    const second = await provider.createPayment({
      ...input("idem-key-0009"),
      entityId: "019361a2-7c00-7000-8000-000000000099",
    });
    await provider.parseWebhook({
      signature: "sig",
      body: {
        event_id: "evt-reversed",
        event_type: "PAYMENT_REVERSED",
        provider: "MOCK",
        provider_reference: second.provider_reference,
        status: "REVERSED",
        amount: second.amount,
        occurred_at: "2026-11-25T10:03:00.000Z",
        payload: {},
      },
    });
    await expect(provider.getPayment(second.id)).resolves.toMatchObject({ status: "REVERSED" });
  });
});
