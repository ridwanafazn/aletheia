import { pool } from "@aletheia/database";
import { incrementCounter } from "@aletheia/observability";
import { AuditDomainSchema, IsoDateTimeSchema, UuidSchema } from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";
import { z } from "zod";

import { decodeCursor, encodeCursor } from "../lib/pagination.js";
import { sendData } from "../lib/response.js";
import { requireRoles } from "../middleware/authorize.js";

interface AuditRow {
  id: string;
  tenant_id: string;
  event_uuid: string;
  correlation_id: string;
  actor_id: string;
  actor_name: string | null;
  actor_role: string;
  domain: string;
  entity_type: string;
  entity_id: string;
  action: string;
  policy_version_id: string | null;
  decision_context: Record<string, unknown>;
  prev_record_hash: string;
  record_hash: string;
  recorded_at: Date;
}

interface AuditChainRow {
  id: string;
  prev_record_hash: string;
  record_hash: string;
  expected_hash: string;
}

const AuditListQuerySchema = z
  .object({
    domain: AuditDomainSchema.optional(),
    entity_id: UuidSchema.optional(),
    actor_id: UuidSchema.optional(),
    from: IsoDateTimeSchema.optional(),
    to: IsoDateTimeSchema.optional(),
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const auditRouter: RouterType = Router();

auditRouter.get(
  "/",
  requireRoles("COMPLIANCE_ADMIN", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const query = AuditListQuerySchema.parse(request.query);
    const conditions = ["a.tenant_id = $1"];
    const values: unknown[] = [auth.tenantId];

    if (query.domain !== undefined) {
      values.push(query.domain);
      conditions.push(`a.domain = $${values.length}`);
    }
    if (query.entity_id !== undefined) {
      values.push(query.entity_id);
      conditions.push(`a.entity_id = $${values.length}`);
    }
    if (query.actor_id !== undefined) {
      values.push(query.actor_id);
      conditions.push(`a.actor_id = $${values.length}`);
    }
    if (query.from !== undefined) {
      values.push(query.from);
      conditions.push(`a.recorded_at >= $${values.length}::timestamptz`);
    }
    if (query.to !== undefined) {
      values.push(query.to);
      conditions.push(`a.recorded_at <= $${values.length}::timestamptz`);
    }
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor);
      values.push(cursor.createdAt, cursor.id);
      conditions.push(
        `(a.recorded_at, a.id) < ($${values.length - 1}::timestamptz, $${values.length}::bigint)`,
      );
    }

    values.push(query.limit + 1);
    const result = await pool.query<AuditRow>(
      `select a.id, a.tenant_id, a.event_uuid, a.correlation_id, a.actor_id,
              u.full_name as actor_name, a.actor_role, a.domain, a.entity_type,
              a.entity_id, a.action, a.policy_version_id, a.decision_context,
              a.prev_record_hash, a.record_hash, a.recorded_at
         from governance.audit_logs a
         left join governance.users u
           on u.id = a.actor_id
          and u.tenant_id = a.tenant_id
        where ${conditions.join(" AND ")}
        order by a.recorded_at desc, a.id desc
        limit $${values.length}`,
      values,
    );

    const hasMore = result.rows.length > query.limit;
    const items = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const last = items.at(-1);
    sendData(response, items, 200, {
      next_cursor:
        hasMore && last !== undefined ? encodeCursor(last.recorded_at, String(last.id)) : null,
      has_more: hasMore,
    });
  },
);

auditRouter.get(
  "/verify",
  requireRoles("COMPLIANCE_ADMIN", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const result = await pool.query<AuditChainRow>(
      `select id, prev_record_hash, record_hash,
              encode(
                digest(
                  convert_to(
                    jsonb_build_object(
                      'tenant_id', tenant_id,
                      'event_uuid', event_uuid,
                      'correlation_id', correlation_id,
                      'actor_id', actor_id,
                      'actor_role', actor_role,
                      'domain', domain,
                      'entity_type', entity_type,
                      'entity_id', entity_id,
                      'action', action,
                      'policy_version_id', policy_version_id,
                      'decision_context', decision_context,
                      'recorded_at', recorded_at
                    )::text || prev_record_hash,
                    'UTF8'
                  ),
                  'sha256'
                ),
                'hex'
              ) as expected_hash
         from governance.audit_logs
        where tenant_id = $1
        order by id asc`,
      [auth.tenantId],
    );

    let expectedPrev = "0".repeat(64);
    let brokenAt: string | null = null;
    let checked = 0;

    for (const row of result.rows) {
      checked += 1;
      if (row.prev_record_hash !== expectedPrev || row.record_hash !== row.expected_hash) {
        brokenAt = String(row.id);
        break;
      }
      expectedPrev = row.record_hash;
    }

    if (brokenAt !== null) {
      incrementCounter("audit_chain_broken_total", { tenant_id: auth.tenantId });
    }
    sendData(response, {
      valid: brokenAt === null,
      checked,
      broken_at: brokenAt,
    });
  },
);
