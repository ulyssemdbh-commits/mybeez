import { describe, it, expect } from "vitest";
import {
  generateToken,
  hashToken,
  verifyToken,
  tokenExpiry,
  isExpired,
  TOKEN_TTL,
} from "../tokenService";

describe("generateToken", () => {
  it("returns a base64url-encoded string with no padding", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t).not.toContain("=");
    // 32 bytes → ~43 chars in base64url
    expect(t.length).toBeGreaterThanOrEqual(42);
    expect(t.length).toBeLessThanOrEqual(44);
  });

  it("never repeats (random)", () => {
    const set = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(set.size).toBe(100);
  });
});

describe("hashToken", () => {
  it("returns a deterministic 64-char hex string", () => {
    const a = hashToken("hello");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("hello")).toBe(a);
    expect(hashToken("Hello")).not.toBe(a);
  });
});

describe("verifyToken", () => {
  it("matches a token against its own hash", () => {
    const t = generateToken();
    expect(verifyToken(t, hashToken(t))).toBe(true);
  });

  it("rejects mismatch", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(verifyToken(t1, hashToken(t2))).toBe(false);
  });

  it("returns false (not throw) on garbage hash", () => {
    expect(verifyToken("anything", "not-hex")).toBe(false);
  });

  it("returns false on empty inputs", () => {
    expect(verifyToken("", "abc")).toBe(false);
    expect(verifyToken("abc", "")).toBe(false);
  });
});

describe("tokenExpiry / isExpired", () => {
  it("computes future expiry from now + ttl", () => {
    const now = new Date("2026-04-30T12:00:00Z");
    const exp = tokenExpiry(now, TOKEN_TTL.passwordReset);
    expect(exp.toISOString()).toBe("2026-04-30T13:00:00.000Z");
  });

  it("isExpired true at the boundary or after", () => {
    const exp = new Date("2026-04-30T12:00:00Z");
    expect(isExpired(exp, new Date("2026-04-30T12:00:00Z"))).toBe(true);
    expect(isExpired(exp, new Date("2026-04-30T12:00:01Z"))).toBe(true);
    expect(isExpired(exp, new Date("2026-04-30T11:59:59Z"))).toBe(false);
  });

  it("TTLs are in the documented order", () => {
    expect(TOKEN_TTL.passwordReset).toBeLessThan(TOKEN_TTL.emailVerification);
  });
});
