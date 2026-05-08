/**
 * Pure helpers for file naming. Tested standalone (no DB / IO).
 * Ported from ulysseclaude `filesRoutes.ts` with a few defensive tweaks.
 */

const SAFE_NAME_REGEX = /[^a-zA-Z0-9._-]/g;
const MAX_SAFE_NAME_LEN = 200;

/**
 * Sanitise a user-supplied file name into something safe for S3 keys
 * and filesystems. Replaces every char that is not [A-Za-z0-9._-] with
 * `_`, then truncates. Empty / dot-only inputs fall back to "file".
 */
export function sanitiseFileName(input: string): string {
  if (!input) return "file";
  const trimmed = input.trim();
  if (!trimmed) return "file";
  const safe = trimmed.replace(SAFE_NAME_REGEX, "_").slice(0, MAX_SAFE_NAME_LEN);
  // "." or ".." or all-dots is unusable as a filename.
  if (/^\.+$/.test(safe)) return "file";
  return safe;
}

/**
 * Build the unique stored name written to R2:
 * `<timestamp>-<safeOriginalName>`. Timestamp is ms since epoch by
 * default but injectable for tests.
 */
export function buildStoredName(originalName: string, now: Date = new Date()): string {
  const safe = sanitiseFileName(originalName);
  return `${now.getTime()}-${safe}`;
}

/**
 * Build the R2 key for a tenant's file:
 * `files/<tenantId>/<storedName>`.
 *
 * NB: R2_PREFIX (env, default `mybeezdb/`) is reserved for the Postgres
 * backups dump path. Files use a separate, hardcoded `files/` prefix so
 * the two namespaces don't collide.
 */
export function buildStorageKey(tenantId: number, storedName: string): string {
  return `files/${tenantId}/${storedName}`;
}

/**
 * Extract `storedName` from a storage key. Inverse of buildStorageKey.
 * Returns null if the key doesn't match the expected layout (defensive
 * against legacy rows or hand-edited paths).
 */
export function parseStorageKey(
  key: string,
): { tenantId: number; storedName: string } | null {
  const m = /^files\/(\d+)\/(.+)$/.exec(key);
  if (!m) return null;
  const tenantId = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(tenantId)) return null;
  return { tenantId, storedName: m[2]! };
}
