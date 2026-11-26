import { EmploymentStatusSchema, PersonnelTypeSchema } from "@aletheia/shared-contracts";
import { z } from "zod";

export const employeeSearchSchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    type: PersonnelTypeSchema.optional(),
    status: EmploymentStatusSchema.optional(),
    branch_id: z.string().uuid().optional(),
  })
  .strict();

export type EmployeeSearch = z.infer<typeof employeeSearchSchema>;
