import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

config({ path: ".env", quiet: true });
config({ path: "../../.env", quiet: true });

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://aletheia:aletheia@localhost:5432/aletheia";

export const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
