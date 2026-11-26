import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeAdminDatabase, db } from "./admin.js";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

async function main(): Promise<void> {
  console.log(`Applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAdminDatabase();
  });
