/**
 * Grant superadmin status to a user, by email.
 *
 * Usage (host or local):
 *   npx tsx scripts/grant-superadmin.ts <email>
 *   npx tsx scripts/grant-superadmin.ts <email> --revoke
 *
 * In Docker:
 *   docker compose exec app npx tsx scripts/grant-superadmin.ts <email>
 *
 * Reads DATABASE_URL from the environment. Exits 0 on success, non-zero
 * with a message on any error.
 */

import { Pool } from "pg";

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = args.find((a) => !a.startsWith("--"));

  if (!email) {
    console.error("Usage: npx tsx scripts/grant-superadmin.ts <email> [--revoke]");
    process.exit(2);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(2);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const target = revoke ? false : true;
    const result = await pool.query(
      `update users
         set is_superadmin = $2,
             updated_at = now()
       where lower(email) = lower($1)
       returning id, email, is_superadmin`,
      [email, target],
    );
    if (result.rowCount === 0) {
      console.error(`No user found with email "${email}".`);
      process.exit(1);
    }
    const row = result.rows[0];
    const verb = target ? "PROMOTED to" : "DEMOTED from";
    console.log(`User ${row.email} (id=${row.id}) ${verb} superadmin.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
