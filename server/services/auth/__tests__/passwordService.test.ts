import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  assertPasswordBounds,
  PasswordTooShortError,
  PasswordTooLongError,
  PASSWORD_LIMITS,
} from "../passwordService";

describe("assertPasswordBounds", () => {
  it("rejects passwords below the minimum length", () => {
    expect(() => assertPasswordBounds("short")).toThrow(PasswordTooShortError);
    expect(() => assertPasswordBounds("a".repeat(PASSWORD_LIMITS.min - 1))).toThrow(
      PasswordTooShortError,
    );
  });

  it("rejects passwords above the maximum length", () => {
    expect(() => assertPasswordBounds("a".repeat(PASSWORD_LIMITS.max + 1))).toThrow(
      PasswordTooLongError,
    );
  });

  it("accepts passwords at the boundaries", () => {
    expect(() => assertPasswordBounds("a".repeat(PASSWORD_LIMITS.min))).not.toThrow();
    expect(() => assertPasswordBounds("a".repeat(PASSWORD_LIMITS.max))).not.toThrow();
  });
});

describe("hashPassword + verifyPassword", () => {
  it("produces a PHC-formatted argon2id hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    // Encoded params should reflect our config.
    expect(hash).toMatch(/m=19456,t=2,p=1/);
  });

  it("verifies the original password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-horse-battery-staple", hash)).toBe(false);
  });

  it("never produces the same hash twice (random salt)", async () => {
    const a = await hashPassword("correct-horse-battery-staple");
    const b = await hashPassword("correct-horse-battery-staple");
    expect(a).not.toBe(b);
  });

  it("returns false (does not throw) on malformed hash", async () => {
    expect(await verifyPassword("anything", "not-a-real-hash")).toBe(false);
  });

  it("returns false on empty inputs", async () => {
    expect(await verifyPassword("", "$argon2id$placeholder")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("rejects too-short passwords at hash time", async () => {
    await expect(hashPassword("short")).rejects.toThrow(PasswordTooShortError);
  });
});
