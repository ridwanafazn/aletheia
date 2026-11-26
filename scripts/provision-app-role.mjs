import { adminPool, closeAdminDatabase } from "../packages/database/dist/admin.js";

const password = process.env.APP_DB_PASSWORD;

async function main() {
  if (password === undefined || password.length < 12 || password.length > 128) {
    throw new Error("APP_DB_PASSWORD wajib diisi, minimal 12 dan maksimal 128 karakter");
  }

  const literal = await adminPool.query("select quote_literal($1)::text as value", [password]);
  const quoted = literal.rows[0]?.value;
  if (typeof quoted !== "string") {
    throw new Error("Gagal menyiapkan literal password");
  }

  await adminPool.query(`alter role aletheia_app with login password ${quoted}`);
  console.log("Role aletheia_app dapat login dengan password yang diberikan.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAdminDatabase();
  });
