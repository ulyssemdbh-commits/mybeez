/**
 * Seed / re-sync the `business_templates` table from the canonical
 * data in `server/seed/templates.ts`.
 *
 * Idempotent: re-runs upsert by slug, so changing the seed file and
 * re-running this script propagates updates to an existing DB.
 *
 * Two-pass insert because of self-FK on parentId:
 *   1. Insert all top-level rows (parentSlug === null)
 *   2. Insert sub-templates resolving parentId from a slug→id map
 *
 * Usage:
 *   npm run seed:templates
 *
 * Required env: DATABASE_URL.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { businessTemplates } from "../shared/schema/templates.ts";
import { SEED_TEMPLATES } from "../server/seed/templates.ts";
import { eq } from "drizzle-orm";

const { Pool } = pg;

function log(msg: string) {
  console.log(`[seed:templates] ${msg}`);
}

function fail(msg: string, err?: unknown): never {
  console.error(`[seed:templates] FAILED: ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: { businessTemplates } });

async function upsertOne(parentId: number | null, t: (typeof SEED_TEMPLATES)[number]) {
  const values = {
    parentId,
    slug: t.slug,
    name: t.name,
    description: t.description,
    modules: t.modules,
    defaultCategories: t.defaultCategories,
    vocabulary: t.vocabulary,
    taxRules: t.taxRules,
    sortOrder: t.sortOrder,
  };

  await db
    .insert(businessTemplates)
    .values(values)
    .onConflictDoUpdate({
      target: businessTemplates.slug,
      set: {
        ...values,
        updatedAt: new Date(),
      },
    });
}

async function main() {
  log(`upserting ${SEED_TEMPLATES.length} templates`);

  // Pass 1: top-level
  const topLevel = SEED_TEMPLATES.filter((t) => t.parentSlug === null);
  for (const t of topLevel) {
    await upsertOne(null, t);
    log(`  ✓ ${t.slug} (top-level)`);
  }

  // Build slug → id map for top-level
  const allRows = await db.select().from(businessTemplates);
  const slugToId = new Map(allRows.map((r) => [r.slug, r.id]));

  // Pass 2: sub-templates
  const subs = SEED_TEMPLATES.filter((t) => t.parentSlug !== null);
  for (const t of subs) {
    const parentId = slugToId.get(t.parentSlug!);
    if (!parentId) fail(`unknown parent slug ${JSON.stringify(t.parentSlug)} for ${t.slug}`);
    await upsertOne(parentId, t);
    log(`  ✓ ${t.slug} (parent=${t.parentSlug})`);
  }

  // Sanity check: report any DB rows that the seed no longer references.
  // We do NOT delete them automatically — manual decision.
  const refreshedRows = await db.select().from(businessTemplates);
  const seedSlugs = new Set(SEED_TEMPLATES.map((t) => t.slug));
  const orphans = refreshedRows.filter((r) => !seedSlugs.has(r.slug));
  if (orphans.length > 0) {
    log(`WARNING: ${orphans.length} row(s) in DB not present in seed file:`);
    for (const o of orphans) log(`  - ${o.slug} (id=${o.id})`);
    log(`These are NOT auto-deleted. Remove manually if intended.`);
  }

  // Spot-check the count using a fresh query (helps catch silent insert failures).
  const finalCount = (await db.select({ id: businessTemplates.id }).from(businessTemplates)).length;
  log(`done. ${finalCount} total rows in business_templates.`);
  void eq;
}

try {
  await main();
} finally {
  await pool.end();
}
