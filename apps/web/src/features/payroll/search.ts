import { BatchStatusSchema } from "@aletheia/shared-contracts";
import { z } from "zod";

export const payrollSearchSchema = z
  .object({
    status: BatchStatusSchema.optional(),
    branch_id: z.string().uuid().optional(),
    period: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  })
  .strict();

export type PayrollSearch = z.infer<typeof payrollSearchSchema>;

export function periodToApi(value: string | undefined): string | undefined {
  return value === undefined ? undefined : `${value}-01`;
}
