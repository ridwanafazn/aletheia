import { z } from "zod";

export const claimsSearchSchema = z.object({
  status: z.string().optional(),
  claim_category: z.string().optional(),
  has_conflict_flag: z.enum(["true", "false"]).optional(),
  branch_id: z.string().uuid().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type ClaimsSearch = z.infer<typeof claimsSearchSchema>;
