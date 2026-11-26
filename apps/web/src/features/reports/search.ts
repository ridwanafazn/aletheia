import { z } from "zod";

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);
const yearSchema = z.string().regex(/^\d{4}$/);

export const payslipSearchSchema = z.object({
  period: periodSchema.optional(),
  personnel_id: z.string().uuid().optional(),
});

export type PayslipSearch = z.infer<typeof payslipSearchSchema>;

export const reportSearchSchema = z.object({
  type: z
    .enum(["PPH21_MONTHLY", "PPH21_ANNUAL", "BPJS_MONTHLY", "BANK_FILE", "PAYROLL_VARIANCE"])
    .optional(),
  period: periodSchema.optional(),
  year: yearSchema.optional(),
  branch_id: z.string().uuid().optional(),
});

export type ReportSearch = z.infer<typeof reportSearchSchema>;
