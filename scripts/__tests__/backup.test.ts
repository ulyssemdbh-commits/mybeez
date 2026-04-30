import { describe, it, expect } from "vitest";
import {
  backupKey,
  parseBackupKey,
  selectExpiredKeys,
  sortBackupsNewestFirst,
} from "../_lib/backup";

describe("backupKey", () => {
  it("generates a deterministic key in UTC", () => {
    const date = new Date("2026-04-30T15:30:42.123Z");
    expect(backupKey("mybeezdb/", date)).toBe(
      "mybeezdb/2026-04-30/postgres-2026-04-30T15-30-42.sql.gz",
    );
  });

  it("supports nested prefixes", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(backupKey("env/prod/mybeezdb/", date)).toBe(
      "env/prod/mybeezdb/2026-01-01/postgres-2026-01-01T00-00-00.sql.gz",
    );
  });

  it("rejects a prefix that does not end with /", () => {
    expect(() => backupKey("mybeezdb", new Date())).toThrow(/must end with/);
  });
});

describe("parseBackupKey", () => {
  it("round-trips backupKey", () => {
    const date = new Date("2026-04-30T15:30:42.000Z");
    const key = backupKey("mybeezdb/", date);
    const parts = parseBackupKey(key);
    expect(parts).not.toBeNull();
    expect(parts!.day).toBe("2026-04-30");
    expect(parts!.timestamp).toBe("2026-04-30T15-30-42");
    expect(parts!.date.toISOString()).toBe("2026-04-30T15:30:42.000Z");
    expect(parts!.prefix).toBe("mybeezdb/");
  });

  it("returns null on foreign keys", () => {
    expect(parseBackupKey("random/file.txt")).toBeNull();
    expect(parseBackupKey("mybeezdb/2026-04-30/notes.txt")).toBeNull();
    expect(parseBackupKey("mybeezdb/2026-04-30/postgres-bogus.sql.gz")).toBeNull();
    expect(parseBackupKey("")).toBeNull();
  });
});

describe("selectExpiredKeys", () => {
  const prefix = "mybeezdb/";
  const now = new Date("2026-04-30T12:00:00Z");

  it("keeps keys within retention window, drops older ones", () => {
    const recent = backupKey(prefix, new Date("2026-04-25T12:00:00Z")); // 5d old
    const oldButInside = backupKey(prefix, new Date("2026-04-01T12:00:00Z")); // 29d old
    const expired = backupKey(prefix, new Date("2026-03-15T12:00:00Z")); // 46d old
    const ancient = backupKey(prefix, new Date("2025-04-30T12:00:00Z")); // 365d old

    const out = selectExpiredKeys([recent, oldButInside, expired, ancient], now, 30);
    expect(out).toEqual([expired, ancient]);
  });

  it("ignores foreign keys silently (never deletes them)", () => {
    const expired = backupKey(prefix, new Date("2026-01-01T12:00:00Z"));
    const out = selectExpiredKeys([expired, "mybeezdb/notes.md", "garbage"], now, 30);
    expect(out).toEqual([expired]);
  });

  it("rejects retentionDays <= 0 (avoids accidental wipe)", () => {
    expect(() => selectExpiredKeys([], now, 0)).toThrow();
    expect(() => selectExpiredKeys([], now, -1)).toThrow();
  });
});

describe("sortBackupsNewestFirst", () => {
  it("sorts descending by embedded date and drops foreign keys", () => {
    const old = backupKey("mybeezdb/", new Date("2026-01-01T00:00:00Z"));
    const mid = backupKey("mybeezdb/", new Date("2026-02-15T00:00:00Z"));
    const recent = backupKey("mybeezdb/", new Date("2026-04-30T00:00:00Z"));
    const out = sortBackupsNewestFirst([mid, "garbage", old, recent]);
    expect(out).toEqual([recent, mid, old]);
  });
});
