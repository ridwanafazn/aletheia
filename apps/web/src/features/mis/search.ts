import { z } from "zod";

export const misSearchSchema = z
  .object({
    period: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    branch_id: z.string().uuid().optional(),
    months: z.coerce.number().int().min(1).max(12).optional(),
  })
  .strict();

export type MisSearch = z.infer<typeof misSearchSchema>;
