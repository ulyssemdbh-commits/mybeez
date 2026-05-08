import { describe, it, expect } from "vitest";
import { scrubMetadata } from "../auditService";

describe("scrubMetadata", () => {
  it("retourne primitives telles quelles", () => {
    expect(scrubMetadata("hello")).toBe("hello");
    expect(scrubMetadata(42)).toBe(42);
    expect(scrubMetadata(true)).toBe(true);
    expect(scrubMetadata(null)).toBeNull();
  });

  it("redacte les cles sensibles (password, token, apikey, secret)", () => {
    const input = {
      email: "user@example.com",
      password: "hunter2",
      newPassword: "letmein",
      currentPassword: "old",
      token: "abc",
      refreshToken: "ref",
      apiKey: "k",
      mfaSecret: "JBSW...",
      totpCode: "123456",
      recoveryCode: "AAAA-BBBB-CCCC",
      passwordHash: "$argon2id$...",
      authorization: "Bearer xyz",
      cookie: "sid=abc",
    };
    const out = scrubMetadata(input) as Record<string, unknown>;
    expect(out.email).toBe("user@example.com");
    expect(out.password).toBe("[redacted]");
    expect(out.newPassword).toBe("[redacted]");
    expect(out.currentPassword).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(out.refreshToken).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.mfaSecret).toBe("[redacted]");
    expect(out.totpCode).toBe("[redacted]");
    expect(out.recoveryCode).toBe("[redacted]");
    expect(out.passwordHash).toBe("[redacted]");
    expect(out.authorization).toBe("[redacted]");
    expect(out.cookie).toBe("[redacted]");
  });

  it("normalise les variantes de casse / underscore / dash", () => {
    const out = scrubMetadata({
      Password: "x",
      access_token: "y",
      "API-KEY": "z",
      "Reset Token": "w",
    }) as Record<string, unknown>;
    expect(out.Password).toBe("[redacted]");
    expect(out.access_token).toBe("[redacted]");
    expect(out["API-KEY"]).toBe("[redacted]");
    expect(out["Reset Token"]).toBe("[redacted]");
  });

  it("redacte de maniere recursive", () => {
    const out = scrubMetadata({
      level1: {
        level2: {
          ok: "preserved",
          password: "hunter2",
        },
      },
    }) as Record<string, Record<string, Record<string, unknown>>>;
    expect(out.level1.level2.ok).toBe("preserved");
    expect(out.level1.level2.password).toBe("[redacted]");
  });

  it("tronque les strings longues a ~500 chars", () => {
    const long = "a".repeat(2000);
    const out = scrubMetadata({ note: long }) as Record<string, string>;
    expect(out.note.length).toBeLessThan(550); // 500 + ellipsis
    expect(out.note.endsWith("…")).toBe(true);
  });

  it("ne tronque pas une string courte", () => {
    expect(scrubMetadata("short")).toBe("short");
  });

  it("limite la profondeur recursive", () => {
    // 6 niveaux, MAX_DEPTH = 4, donc le 5e+ doit etre tronque.
    const deep: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = deep;
    for (let i = 0; i < 6; i++) {
      const next: Record<string, unknown> = {};
      cursor.nested = next;
      cursor = next;
    }
    cursor.value = "leaf";
    const out = scrubMetadata(deep);
    // Au-dela de MAX_DEPTH, on doit voir la sentinelle.
    const stringified = JSON.stringify(out);
    expect(stringified).toContain("truncated:max-depth");
  });

  it("clone les arrays sans muter l'input", () => {
    const arr = [1, 2, { password: "x" }];
    const out = scrubMetadata(arr) as Array<unknown>;
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(3);
    expect((out[2] as Record<string, unknown>).password).toBe("[redacted]");
    // Input non mute.
    expect((arr[2] as Record<string, unknown>).password).toBe("x");
  });

  it("tronque les arrays longs a 50 elements", () => {
    const huge = Array.from({ length: 200 }, (_, i) => i);
    const out = scrubMetadata(huge) as Array<unknown>;
    expect(out.length).toBe(50);
  });

  it("ignore les types non serialisables (function, symbol)", () => {
    const out = scrubMetadata({
      ok: "value",
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      fn: () => {},
      sym: Symbol("nope"),
    }) as Record<string, unknown>;
    expect(out.ok).toBe("value");
    expect(out.fn).toBeUndefined();
    expect(out.sym).toBeUndefined();
  });

  it("preserve les valeurs non-sensibles dans une vraie req.body de login", () => {
    // Cas reel : on logue un metadata { reason, email } pour login.failure.
    const out = scrubMetadata({ reason: "wrong_password", email: "alice@ex.com" });
    expect(out).toEqual({ reason: "wrong_password", email: "alice@ex.com" });
  });
});
