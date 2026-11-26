import { z } from "zod";

import { DateOnlySchema, IsoDateTimeSchema, UuidSchema } from "./primitives.js";

export const WhatIfSimulationRequestSchema = z
  .object({
    simulation_name: z.string().trim().min(3).max(120),
    base_policy_version_id: UuidSchema,
    simulated_rules_payload: z.record(z.string(), z.unknown()),
    target_period_start: DateOnlySchema,
    target_period_end: DateOnlySchema,
    branch_id: UuidSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Date.parse(value.target_period_end) >= Date.parse(value.target_period_start), {
    message: "target_period_end harus sama atau setelah target_period_start",
    path: ["target_period_end"],
  });
export type WhatIfSimulationRequest = z.infer<typeof WhatIfSimulationRequestSchema>;

export const WhatIfRunResponseSchema = z
  .object({
    event_id: UuidSchema,
    status: z.literal("QUEUED"),
    enqueued: z.boolean(),
    requested_at: IsoDateTimeSchema,
  })
  .strict();
export type WhatIfRunResponse = z.infer<typeof WhatIfRunResponseSchema>;
