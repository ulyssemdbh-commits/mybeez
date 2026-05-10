/**
 * Trash service — moves files to `files_trash`, restores them, and
 * runs a scheduled purge for rows past `expiresAt`.
 *
 * Pure helpers (`computeExpiresAt`, `isExpired`) are exported and unit-
 * tested. Side-effecting functions (`purgeExpiredTrash`, `scheduleTrashPurge`)
 * are wired in `server/index.ts` at boot.
 */

import { lt } from "drizzle-orm";
import { db } from "../../db";
import { filesTrash } from "../../../shared/schema/checklist";
import { deleteFileFromStorage } from "./storage";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("FilesTrash");

/** Default retention before hard-delete. 7 days, matching ulysseclaude. */
export const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Frequency of the background purge sweep. Hourly = good signal/noise. */
export const TRASH_PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** Delay before the first purge fires after boot. Lets the app warm up. */
export const TRASH_PURGE_INITIAL_DELAY_MS = 10_000;

/** Pure: when does a row trashed at `deletedAt` expire? */
export function computeExpiresAt(deletedAt: Date, ttlMs: number = TRASH_TTL_MS): Date {
  return new Date(deletedAt.getTime() + ttlMs);
}

/** Pure: is a trash row past its expiry as of `now`? */
export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() > expiresAt.getTime();
}

/**
 * Deletes every trash row whose `expiresAt` is in the past, deleting
 * the associated R2 objects first (best-effort — deleteFileFromStorage
 * is fail-soft so a missing object never blocks the DB cleanup).
 *
 * Returns the count of rows purged. Surfaced in logs so the operator
 * can see the sweep ran even when the trash was empty.
 */
export async function purgeExpiredTrash(now: Date = new Date()): Promise<number> {
  try {
    const rows = await db
      .select({ id: filesTrash.id, storagePath: filesTrash.storagePath })
      .from(filesTrash)
      .where(lt(filesTrash.expiresAt, now));

    if (rows.length === 0) return 0;

    for (const row of rows) {
      await deleteFileFromStorage(row.storagePath);
    }

    await db.delete(filesTrash).where(lt(filesTrash.expiresAt, now));
    log.info({ purged: rows.length }, "trash purge: rows hard-deleted");
    return rows.length;
  } catch (err) {
    log.error({ err }, "purge failed (will retry next interval)");
    return 0;
  }
}

/**
 * Boots the periodic purge. Idempotent: a second call replaces the
 * existing timer (useful for tests).
 */
let purgeTimer: NodeJS.Timeout | null = null;
let purgeBootTimer: NodeJS.Timeout | null = null;

export function scheduleTrashPurge(): void {
  if (purgeBootTimer) clearTimeout(purgeBootTimer);
  if (purgeTimer) clearInterval(purgeTimer);

  purgeBootTimer = setTimeout(() => {
    void purgeExpiredTrash();
    purgeTimer = setInterval(() => void purgeExpiredTrash(), TRASH_PURGE_INTERVAL_MS);
  }, TRASH_PURGE_INITIAL_DELAY_MS);

  // Don't keep the event loop alive just for the purge timer.
  purgeBootTimer.unref?.();
}

export function _stopTrashPurge(): void {
  if (purgeBootTimer) {
    clearTimeout(purgeBootTimer);
    purgeBootTimer = null;
  }
  if (purgeTimer) {
    clearInterval(purgeTimer);
    purgeTimer = null;
  }
}
