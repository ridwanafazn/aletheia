import { AsyncLocalStorage } from "node:async_hooks";

import { config } from "dotenv";
import { Pool, type PoolClient, type QueryConfig, type QueryResult, type QueryResultRow } from "pg";

config({ path: ".env", quiet: true });
config({ path: "../../.env", quiet: true });

const connectionString =
  process.env.DATABASE_URL_APP ??
  process.env.DATABASE_URL ??
  "postgresql://aletheia:aletheia@localhost:5432/aletheia";

interface TenantStore {
  tenantId: string;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

export function runWithTenant<T>(tenantId: string, callback: () => T): T {
  return tenantStorage.run({ tenantId }, callback);
}

const BEGIN_PATTERN = /^\s*(begin|start\s+transaction)\b/i;

function queryText(input: string | QueryConfig): string {
  return typeof input === "string" ? input : input.text;
}

export class TenantPool {
  constructor(private readonly inner: Pool) {}

  get totalCount(): number {
    return this.inner.totalCount;
  }

  get idleCount(): number {
    return this.inner.idleCount;
  }

  get waitingCount(): number {
    return this.inner.waitingCount;
  }

  async query<R extends QueryResultRow = QueryResultRow>(
    queryTextOrConfig: string | QueryConfig,
    values?: unknown[],
  ): Promise<QueryResult<R>> {
    const tenantId = getTenantId();
    if (tenantId === undefined) {
      return this.inner.query<R>(queryTextOrConfig as never, values as never);
    }

    const client = await this.inner.connect();
    try {
      await client.query("BEGIN");
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await client.query<R>(queryTextOrConfig as never, values as never);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async systemQuery<R extends QueryResultRow = QueryResultRow>(
    queryTextOrConfig: string | QueryConfig,
    values?: unknown[],
  ): Promise<QueryResult<R>> {
    return this.inner.query<R>(queryTextOrConfig as never, values as never);
  }

  async connect(): Promise<PoolClient> {
    const client = await this.inner.connect();
    const tenantId = getTenantId();

    if (tenantId === undefined) {
      return client;
    }

    const originalQuery = client.query.bind(client) as (
      textOrConfig: string | QueryConfig,
      values?: unknown[],
    ) => Promise<QueryResult>;

    const tenantQuery = (async (
      textOrConfig: string | QueryConfig,
      values?: unknown[],
    ): Promise<QueryResult> => {
      const result = await originalQuery(textOrConfig, values);
      if (BEGIN_PATTERN.test(queryText(textOrConfig))) {
        await originalQuery("select set_config('app.tenant_id', $1, true)", [tenantId]);
      }
      return result;
    }) as PoolClient["query"];

    return new Proxy(client, {
      get(target, property, receiver) {
        if (property === "query") {
          return tenantQuery;
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as PoolClient;
  }

  async end(): Promise<void> {
    await this.inner.end();
  }
}

export const pool = new TenantPool(
  new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  }),
);

export function systemQuery<R extends QueryResultRow = QueryResultRow>(
  queryTextOrConfig: string | QueryConfig,
  values?: unknown[],
): Promise<QueryResult<R>> {
  return pool.systemQuery<R>(queryTextOrConfig, values);
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
