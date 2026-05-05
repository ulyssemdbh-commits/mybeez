import { describe, it, expect } from "vitest";
import { generateSync } from "otplib";
import {
  generateTotpSecret,
  buildOtpauthUrl,
  verifyTotp,
  generateRecoveryCode,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  hashRecoveryCode,
  findRecoveryCodeIndex,
  generatePendingId,
  MFA_CONSTANTS,
} from "../mfaService";

describe("generateTotpSecret", () => {
  it("returns a non-empty base32 string (~32 chars by default)", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(16);
  });

  it("produces a fresh secret each call", () => {
    const set = new Set(Array.from({ length: 50 }, () => generateTotpSecret()));
    expect(set.size).toBe(50);
  });
});

describe("buildOtpauthUrl", () => {
  it("encodes account name and issuer (default myBeez)", () => {
    const url = buildOtpauthUrl({ secret: "JBSWY3DPEHPK3PXP", accountName: "alice@example.com" });
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain("myBeez");
    expect(url).toContain("alice%40example.com");
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
  });

  it("respects a custom issuer", () => {
    const url = buildOtpauthUrl({
      secret: "JBSWY3DPEHPK3PXP",
      accountName: "u@x.io",
      issuer: "MyOrg",
    });
    expect(url).toContain("MyOrg");
  });
});

describe("verifyTotp", () => {
  it("accepts a freshly generated code for the same secret", () => {
    const secret = generateTotpSecret();
    // otplib generate uses the same options as our service module sets.
    const code = generateSync({ secret });
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "000000")).toBe(false);
  });

  it("rejects malformed input (non-6-digit)", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "12345A")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });

  it("trims spaces around the code", () => {
    const secret = generateTotpSecret();
    const code = generateSync({ secret });
    expect(verifyTotp(secret, `  ${code}  `)).toBe(true);
  });

  it("returns false (not throws) on empty secret", () => {
    expect(verifyTotp("", "123456")).toBe(false);
  });
});

describe("generateRecoveryCode / generateRecoveryCodes", () => {
  it("generates a single code in the expected XXXX-XXXX-XXXX format", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}$/);
  });

  it("avoids ambiguous chars (no I, L, O, U, 0, 1)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRecoveryCode();
      expect(code).not.toMatch(/[ILOU01]/);
    }
  });

  it("generates exactly RECOVERY_CODE_COUNT distinct codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(MFA_CONSTANTS.recoveryCodeCount);
    expect(new Set(codes).size).toBe(MFA_CONSTANTS.recoveryCodeCount);
  });
});

describe("normalizeRecoveryCode", () => {
  it("strips dashes, spaces, and uppercases", () => {
    expect(normalizeRecoveryCode("abcd-efgh-jkmn")).toBe("ABCDEFGHJKMN");
    expect(normalizeRecoveryCode(" abcd efgh jkmn ")).toBe("ABCDEFGHJKMN");
    expect(normalizeRecoveryCode("ABCD-EFGH-JKMN")).toBe("ABCDEFGHJKMN");
  });
});

describe("hashRecoveryCode", () => {
  it("returns a 64-char sha-256 hex string", () => {
    expect(hashRecoveryCode("ABCD-EFGH-JKMN")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores formatting (dashes, spaces, case)", () => {
    const a = hashRecoveryCode("ABCD-EFGH-JKMN");
    expect(hashRecoveryCode("abcd-efgh-jkmn")).toBe(a);
    expect(hashRecoveryCode(" abcdefghjkmn ")).toBe(a);
    expect(hashRecoveryCode("abcd efgh jkmn")).toBe(a);
  });

  it("differs for different codes", () => {
    expect(hashRecoveryCode("AAAA-BBBB-CCCC")).not.toBe(hashRecoveryCode("AAAA-BBBB-CCCD"));
  });
});

describe("findRecoveryCodeIndex", () => {
  const codes = generateRecoveryCodes();
  const hashes = codes.map(hashRecoveryCode);

  it("finds the matching index for a valid code", () => {
    expect(findRecoveryCodeIndex(codes[3]!, hashes)).toBe(3);
  });

  it("matches case-insensitively and dash-insensitively", () => {
    const formatted = codes[5]!;
    const noDashes = formatted.replace(/-/g, "");
    const lower = formatted.toLowerCase();
    expect(findRecoveryCodeIndex(noDashes, hashes)).toBe(5);
    expect(findRecoveryCodeIndex(lower, hashes)).toBe(5);
  });

  it("returns -1 for an unknown code", () => {
    expect(findRecoveryCodeIndex("ZZZZ-ZZZZ-ZZZZ", hashes)).toBe(-1);
  });

  it("returns -1 on empty inputs", () => {
    expect(findRecoveryCodeIndex("", hashes)).toBe(-1);
    expect(findRecoveryCodeIndex(codes[0]!, [])).toBe(-1);
  });

  it("returns -1 on garbage stored entries (not throws)", () => {
    expect(findRecoveryCodeIndex(codes[0]!, ["not-hex"])).toBe(-1);
  });
});

describe("generatePendingId", () => {
  it("returns a base64url string with no padding", () => {
    const id = generatePendingId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(id).not.toContain("=");
  });

  it("does not collide across many calls", () => {
    const set = new Set(Array.from({ length: 100 }, () => generatePendingId()));
    expect(set.size).toBe(100);
  });
});

describe("MFA_CONSTANTS", () => {
  it("uses Google-Authenticator-compatible defaults", () => {
    expect(MFA_CONSTANTS.totpDigits).toBe(6);
    expect(MFA_CONSTANTS.totpStepSeconds).toBe(30);
  });

  it("recovery code count is 10 (industry standard)", () => {
    expect(MFA_CONSTANTS.recoveryCodeCount).toBe(10);
  });
});
