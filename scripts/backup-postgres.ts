/**
 * Backup the Postgres DB pointed to by DATABASE_URL to Cloudflare R2.
 *
 * Pipeline:
 *   pg_dump --format=plain (custom would be smaller, but plain is
 *   trivially `psql`-restorable from any laptop)
 *     | gzip
 *     | streamed multipart upload to R2
 *     -> retention sweep on the same prefix
 *
 * Usage:
 *   npm run backup
 *
 * Required env: see scripts/_lib/r2.ts + DATABASE_URL.
 *
 * Designed to be safe to call from cron / systemd timer:
 *   - Exits 0 only on full success (upload OK + retention OK)
 *   - Exits non-zero with an explicit message otherwise
 *   - Never deletes anything if the upload step fails
 */

import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { Readable, PassThrough } from "node:stream";
import {
  loadR2Config,
  makeR2Client,
  uploadStream,
  listObjects,
  deleteObjects,
} from "./_lib/r2.ts";
import { backupKey, selectExpiredKeys } from "./_lib/backup.ts";

const DEFAULT_RETENTION_DAYS = 30;

function log(msg: string) {
  console.log(`[backup] ${msg}`);
}

function fail(msg: string, err?: unknown): never {
  console.error(`[backup] FAILED: ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL is not set");

  const cfg = loadR2Config();
  const client = makeR2Client(cfg);

  const startedAt = new Date();
  const key = backupKey(cfg.prefix, startedAt);
  log(`pg_dump ${maskUrl(databaseUrl!)} -> r2://${cfg.bucket}/${key}`);

  // pg_dump stdout -> gzip -> R2 upload (single streaming pipeline, no
  // temp files, constant memory regardless of DB size).
  const dump = spawn("pg_dump", ["--no-owner", "--no-privileges", databaseUrl!], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let dumpStderr = "";
  dump.stderr.on("data", (chunk) => {
    dumpStderr += chunk.toString();
  });

  const dumpExit = new Promise<number>((resolve, reject) => {
    dump.on("error", reject);
    dump.on("close", (code) => resolve(code ?? -1));
  });

  const passthrough = new PassThrough();
  dump.stdout.pipe(createGzip({ level: 6 })).pipe(passthrough);

  let upload: Awaited<ReturnType<typeof uploadStream>>;
  try {
    upload = await uploadStream(client, cfg.bucket, key, passthrough);
  } catch (err) {
    fail(`R2 upload failed for ${key}`, err);
  }

  const code = await dumpExit;
  if (code !== 0) {
    fail(`pg_dump exited with code ${code}\nstderr:\n${dumpStderr}`);
  }

  log(`uploaded ETag=${upload!.etag ?? "?"}`);

  const retention = parseInt(process.env.BACKUP_RETENTION_DAYS ?? "", 10);
  const days = Number.isFinite(retention) && retention > 0 ? retention : DEFAULT_RETENTION_DAYS;

  log(`retention sweep (>${days} days)`);
  const all = await listObjects(client, cfg.bucket, cfg.prefix);
  const keys = all.map((o) => o.Key!).filter(Boolean);
  const expired = selectExpiredKeys(keys, new Date(), days);
  if (expired.length === 0) {
    log("nothing to expire");
  } else {
    log(`deleting ${expired.length} expired backup(s)`);
    await deleteObjects(client, cfg.bucket, expired);
    for (const k of expired) log(`  - ${k}`);
  }

  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  log(`done in ${elapsed}s`);
}

function maskUrl(url: string): string {
  // Hide password from logs: postgres://user:****@host/db
  return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, "$1****$3");
}

// `tsx scripts/backup-postgres.ts` runs this as the entrypoint.
// Avoid relying on `import.meta` checks (allowImportingTsExtensions
// makes them fragile); just await main() at top level.
await main();

// Silence the "unused stream import" complaint without changing the
// surface — this stays cheap and explicit.
void Readable;
