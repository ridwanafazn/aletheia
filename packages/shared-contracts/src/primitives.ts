import { z } from "zod";

export const UuidSchema = z.string().uuid();
export const TenantIdSchema = UuidSchema;
export const CorrelationIdSchema = UuidSchema;

export const MoneySchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Gunakan string desimal non-negatif dengan maksimal 2 desimal");

export const SignedMoneySchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Gunakan string desimal dengan maksimal 2 desimal");

export const RateSchema = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Gunakan string desimal non-negatif dengan maksimal 4 desimal");

export const PercentageSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Gunakan string persentase dengan maksimal 2 desimal")
  .refine((value) => Number(value) >= 0 && Number(value) <= 100, {
    message: "Persentase harus berada di antara 0 dan 100",
  });

export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const PeriodMonthSchema = z.string().regex(/^\d{4}-\d{2}-01$/);
export const TaxYearSchema = z.coerce.number().int().min(2000).max(2100);
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const CursorSchema = z.string().min(1).max(512);
export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const PaginationQuerySchema = z
  .object({
    cursor: CursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const NikSchema = z.string().regex(/^\d{16}$/, "NIK harus 16 digit");
export const BankAccountSchema = z
  .string()
  .regex(/^\d{6,34}$/, "Nomor rekening harus 6 sampai 34 digit");
export const MaskedNikSchema = z.string().regex(/^\d{4}\*+\d{4}$/);
export const MaskedAccountSchema = z.string().min(4).max(24);

export const SortDirectionSchema = z.enum(["asc", "desc"]);
export const BooleanQuerySchema = z.enum(["true", "false"]).transform((value) => value === "true");

export const NonEmptyStringSchema = z.string().trim().min(1);
export const NotesSchema = z.string().trim().min(15).max(2000);
