/**
 * Restore a Postgres dump from Cloudflare R2 into DATABASE_URL.
 *
 * Usage:
 *   npm run restore                       -> list 20 most recent dumps
 *   npm run restore -- <key>              -> restore that exact key
 *   npm run restore -- latest             -> restore the most recent dump
 *
 * Safety:
 *   - Requires `RESTORE_CONFIRM=I_KNOW_WHAT_IM_DOING` env var to actually run.
 *     Without it, prints what WOULD happen and exits 0. Avoids
 *     accidental wipes via mistyped commands.
 *   - Streams: gunzip(R2) | psql DATABASE_URL
 *   - Does NOT drop / recreate the schema. The dump itself is plain
 *     SQL (`pg_dump --no-owner --no-privileges`); existing rows that
 *     conflict on PK will fail loudly. For a clean restore, drop the
 *     DB beforehand.
 */

import { spawn } from "node:child_process";
import { createGunzip } from "node:zlib";
import {
  loadR2Config,
  makeR2Client,
  listObjects,
  downloadStream,
} from "./_lib/r2.ts";
import { sortBackupsNewestFirst, parseBackupKey } from "./_lib/backup.ts";

function log(msg: string) {
  console.log(`[restore] ${msg}`);
}

function fail(msg: string, err?: unknown): never {
  console.error(`[restore] FAILED: ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

function maskUrl(url: string): string {
  return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, "$1****$3");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL is not set");

  const cfg = loadR2Config();
  const client = makeR2Client(cfg);

  const arg = process.argv[2];

  // Listing mode
  if (!arg) {
    const all = await listObjects(client, cfg.bucket, cfg.prefix);
    const sorted = sortBackupsNewestFirst(all.map((o) => o.Key!).filter(Boolean));
    if (sorted.length === 0) {
      log(`no backups found under r2://${cfg.bucket}/${cfg.prefix}`);
      return;
    }
    log(`${sorted.length} backup(s) found, most recent first:`);
    for (const k of sorted.slice(0, 20)) {
      const p = parseBackupKey(k)!;
      console.log(`  ${p.date.toISOString()}  ${k}`);
    }
    log("");
    log("To restore: npm run restore -- <key>");
    log("To restore the most recent: npm run restore -- latest");
    return;
  }

  // Resolve target key
  let key = arg;
  if (arg === "latest") {
    const all = await listObjects(client, cfg.bucket, cfg.prefix);
    const sorted = sortBackupsNewestFirst(all.map((o) => o.Key!).filter(Boolean));
    if (sorted.length === 0) fail(`no backups found under r2://${cfg.bucket}/${cfg.prefix}`);
    key = sorted[0];
    log(`'latest' resolved to ${key}`);
  }

  const confirm = process.env.RESTORE_CONFIRM;
  const target = maskUrl(databaseUrl!);

  if (confirm !== "I_KNOW_WHAT_IM_DOING") {
    log(`DRY RUN — would restore r2://${cfg.bucket}/${key} into ${target}`);
    log(`Re-run with: RESTORE_CONFIRM=I_KNOW_WHAT_IM_DOING npm run restore -- ${arg}`);
    return;
  }

  log(`restoring r2://${cfg.bucket}/${key} into ${target}`);

  const body = await downloadStream(client, cfg.bucket, key);
  const psql = spawn("psql", [databaseUrl!], { stdio: ["pipe", "inherit", "inherit"] });

  body.pipe(createGunzip()).pipe(psql.stdin);

  const code: number = await new Promise((resolve, reject) => {
    psql.on("error", reject);
    psql.on("close", (c) => resolve(c ?? -1));
  });

  if (code !== 0) fail(`psql exited with code ${code}`);
  log("restore completed");
}

await main();
