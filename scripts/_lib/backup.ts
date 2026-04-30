/**
 * Pure helpers for the backup pipeline — no IO, fully unit-testable.
 *
 * Naming convention for backup objects in R2:
 *   <prefix>/YYYY-MM-DD/postgres-YYYY-MM-DDTHH-MM-SS.sql.gz
 *
 * Date partition lets us list a day with a single S3 prefix scan and
 * makes manual cleanup trivial.
 */

const KEY_RE =
  /^(?<prefix>.+\/)(?<day>\d{4}-\d{2}-\d{2})\/postgres-(?<ts>\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.sql\.gz$/;

export interface BackupKeyParts {
  prefix: string;
  day: string;
  timestamp: string;
  date: Date;
}

/**
 * Builds an R2 object key for a backup taken at `date`.
 *
 * - `prefix` MUST end with `/` (e.g. `mybeezdb/`)
 * - `date`   defaults to `new Date()`
 *
 * Always serialises in UTC to avoid drift across timezones / DST.
 */
export function backupKey(prefix: string, date: Date = new Date()): string {
  if (!prefix.endsWith("/")) {
    throw new Error(`backupKey: prefix must end with '/', got ${JSON.stringify(prefix)}`);
  }
  const iso = date.toISOString(); // "2026-04-30T15:30:42.123Z"
  const day = iso.slice(0, 10); // "2026-04-30"
  const ts = iso.slice(0, 19).replace(/:/g, "-"); // "2026-04-30T15-30-42"
  return `${prefix}${day}/postgres-${ts}.sql.gz`;
}

/**
 * Inverse of `backupKey`: returns null if the key doesn't match the
 * expected pattern (so foreign objects in the bucket are ignored
 * cleanly by retention sweeps and listings).
 */
export function parseBackupKey(key: string): BackupKeyParts | null {
  const m = KEY_RE.exec(key);
  if (!m || !m.groups) return null;
  const ts = m.groups.ts;
  // Re-inflate "YYYY-MM-DDTHH-MM-SS" into ISO "YYYY-MM-DDTHH:MM:SSZ"
  const isoTs = ts.slice(0, 10) + "T" + ts.slice(11).replace(/-/g, ":") + "Z";
  const date = new Date(isoTs);
  if (isNaN(date.getTime())) return null;
  return { prefix: m.groups.prefix, day: m.groups.day, timestamp: ts, date };
}

/**
 * Filter a list of object keys, returning those whose embedded date is
 * STRICTLY older than `retentionDays` relative to `now`. Foreign /
 * unparseable keys are NEVER returned.
 */
export function selectExpiredKeys(
  keys: string[],
  now: Date,
  retentionDays: number,
): string[] {
  if (retentionDays <= 0) {
    throw new Error(`selectExpiredKeys: retentionDays must be > 0`);
  }
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const expired: string[] = [];
  for (const k of keys) {
    const parts = parseBackupKey(k);
    if (!parts) continue;
    if (parts.date.getTime() < cutoff) expired.push(k);
  }
  return expired;
}

/**
 * Sorts backup keys most-recent first. Foreign keys are dropped.
 */
export function sortBackupsNewestFirst(keys: string[]): string[] {
  return keys
    .map((k) => ({ k, p: parseBackupKey(k) }))
    .filter((x): x is { k: string; p: BackupKeyParts } => x.p !== null)
    .sort((a, b) => b.p.date.getTime() - a.p.date.getTime())
    .map((x) => x.k);
}
