import { randomUUID } from "node:crypto";

import { pool } from "@aletheia/database";
import { withSpan } from "@aletheia/observability";
import type { Pool, PoolClient } from "pg";

export type Queryable = Pick<Pool | PoolClient, "query">;

export interface AuditInput {
  tenantId: string;
  actorId: string;
  actorRole: string;
  domain: "GOVERNANCE" | "CLAIMS" | "PAYROLL" | "ANALYTICS";
  entityType: string;
  entityId: string;
  action: string;
  policyVersionId: string | null;
  decisionContext: Record<string, unknown>;
  correlationId: string;
  eventUuid?: string;
}

export async function appendAudit(input: AuditInput, queryable: Queryable = pool): Promise<void> {
  await withSpan(
    "audit.append",
    { "audit.entity_type": input.entityType, "audit.action": input.action },
    async () => {
      await queryable.query(
        `select governance.append_audit_log($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          input.tenantId,
          input.eventUuid ?? randomUUID(),
          input.correlationId,
          input.actorId,
          input.actorRole,
          input.domain,
          input.entityType,
          input.entityId,
          input.action,
          input.policyVersionId,
          input.decisionContext,
        ],
      );
    },
  );
}
