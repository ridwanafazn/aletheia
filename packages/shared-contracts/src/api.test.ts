import { describe, expect, it } from "vitest";
import { z } from "zod";

import { apiResponseSchema } from "./api.js";
import { ErrorStatusByCode } from "./errors.js";
import { IdempotencyKeySchema, PaginationQuerySchema } from "./primitives.js";

const SampleSchema = z.object({ id: z.string().min(1) }).strict();
const ResponseSchema = apiResponseSchema(SampleSchema);

describe("API envelope", () => {
  it("menerima respons sukses", () => {
    const result = ResponseSchema.safeParse({
      success: true,
      correlation_id: "019361a2-7c00-7000-8000-000000000001",
      data: { id: "claim-1" },
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("menerima respons gagal", () => {
    const result = ResponseSchema.safeParse({
      success: false,
      correlation_id: "019361a2-7c00-7000-8000-000000000001",
      data: null,
      error: {
        code: "ERR_SOD_VIOLATION",
        message: "Maker tidak boleh menyetujui pengajuannya sendiri",
        correlation_id: "019361a2-7c00-7000-8000-000000000001",
        retryable: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it("menolak sukses tanpa data", () => {
    const result = ResponseSchema.safeParse({
      success: true,
      correlation_id: "019361a2-7c00-7000-8000-000000000001",
      data: null,
      error: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("PaginationQuerySchema", () => {
  it("memberi limit default 25", () => {
    const result = PaginationQuerySchema.parse({});
    expect(result.limit).toBe(25);
  });

  it("menolak limit di atas 100", () => {
    expect(PaginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("ErrorStatusByCode", () => {
  it("memetakan kode konflik ke 409", () => {
    expect(ErrorStatusByCode.ERR_CONCURRENT_LOCK).toBe(409);
    expect(ErrorStatusByCode.ERR_SOD_VIOLATION).toBe(403);
  });
});

describe("IdempotencyKeySchema", () => {
  it("menolak spasi", () => {
    expect(IdempotencyKeySchema.safeParse("key dengan spasi").success).toBe(false);
  });
});
