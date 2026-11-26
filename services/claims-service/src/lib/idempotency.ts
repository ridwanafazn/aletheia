import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { ApiError } from "./errors.js";

export interface IdempotencyInput {
  tenantId: string;
  actorId: string;
  scope: string;
  key: string;
  requestHash: string;
}

export interface CompletedResponse {
  status: number;
  data: Record<string, unknown>;
}

export type IdempotencyResult =
  { kind: "proceed"; recordId: string } | { kind: "replay"; response: CompletedResponse };

interface IdempotencyRow {
  id: string;
  request_hash: string;
  status: "IN_PROGRESS" | "COMPLETED";
  response_status: number | null;
  response_body: Record<string, unknown> | null;
}

export async function beginIdempotency(
  client: PoolClient,
  input: IdempotencyInput,
): Promise<IdempotencyResult> {
  const recordId = randomUUID();
  const inserted = await client.query<{ id: string }>(
    `insert into governance.idempotency_records
       (id, tenant_id, actor_id, scope, idempotency_key, request_hash, status)
     values ($1,$2,$3,$4,$5,$6,'IN_PROGRESS')
     on conflict (tenant_id, actor_id, scope, idempotency_key) do nothing
     returning id`,
    [recordId, input.tenantId, input.actorId, input.scope, input.key, input.requestHash],
  );

  if (inserted.rows.length === 1) {
    return { kind: "proceed", recordId };
  }

  const existing = await client.query<IdempotencyRow>(
    `select id, request_hash, status, response_status, response_body
       from governance.idempotency_records
      where tenant_id = $1
        and actor_id = $2
        and scope = $3
        and idempotency_key = $4
      for update`,
    [input.tenantId, input.actorId, input.scope, input.key],
  );

  const row = existing.rows[0];
  if (row === undefined) {
    throw new ApiError(409, "ERR_IDEMPOTENCY_CONFLICT", "Kunci idempotensi tidak dapat diproses");
  }

  if (row.request_hash !== input.requestHash) {
    throw new ApiError(
      409,
      "ERR_IDEMPOTENCY_CONFLICT",
      "Kunci idempotensi sudah dipakai untuk payload berbeda",
    );
  }

  if (row.status === "COMPLETED" && row.response_status !== null && row.response_body !== null) {
    return {
      kind: "replay",
      response: { status: row.response_status, data: row.response_body },
    };
  }

  throw new ApiError(
    409,
    "ERR_IDEMPOTENCY_CONFLICT",
    "Permintaan dengan kunci idempotensi ini sedang diproses",
  );
}

export async function completeIdempotency(
  client: PoolClient,
  recordId: string,
  response: CompletedResponse,
): Promise<void> {
  await client.query(
    `update governance.idempotency_records
        set status = 'COMPLETED',
            response_status = $2,
            response_body = $3,
            completed_at = now()
      where id = $1`,
    [recordId, response.status, response.data],
  );
}
