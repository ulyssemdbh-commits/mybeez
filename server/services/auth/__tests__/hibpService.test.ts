import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isHibpDisabled, suffixIsPwned, isPasswordPwned } from "../hibpService";

describe("isHibpDisabled", () => {
  const originalEnv = process.env.HIBP_DISABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.HIBP_DISABLED;
    } else {
      process.env.HIBP_DISABLED = originalEnv;
    }
  });

  it("retourne false par défaut", () => {
    delete process.env.HIBP_DISABLED;
    expect(isHibpDisabled()).toBe(false);
  });

  it("retourne true seulement quand HIBP_DISABLED='true'", () => {
    process.env.HIBP_DISABLED = "true";
    expect(isHibpDisabled()).toBe(true);
  });

  it("rejette les autres valeurs (1/yes/on)", () => {
    process.env.HIBP_DISABLED = "1";
    expect(isHibpDisabled()).toBe(false);
    process.env.HIBP_DISABLED = "yes";
    expect(isHibpDisabled()).toBe(false);
  });
});

describe("suffixIsPwned", () => {
  // HIBP returns CRLF-separated `SUFFIX:COUNT` lines.
  const sampleBody =
    "001A6F6FB6E7B6CC8E1F4F25C5E4F6E5DC3:5\r\n" +
    "00CB6BA9B41E10C7C92F6F4F84A11C2A789:2\r\n" +
    "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1";

  it("retourne true sur un suffixe présent", () => {
    expect(suffixIsPwned(sampleBody, "00CB6BA9B41E10C7C92F6F4F84A11C2A789")).toBe(true);
  });

  it("retourne true case-insensitive", () => {
    expect(suffixIsPwned(sampleBody, "00cb6ba9b41e10c7c92f6f4f84a11c2a789")).toBe(true);
  });

  it("retourne false sur un suffixe absent", () => {
    expect(suffixIsPwned(sampleBody, "DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEAD")).toBe(false);
  });

  it("retourne false sur un body vide ou whitespace", () => {
    expect(suffixIsPwned("", "abc")).toBe(false);
    expect(suffixIsPwned("\r\n\r\n", "abc")).toBe(false);
  });

  it("tolère les lignes sans count (just SUFFIX)", () => {
    const body = "ABCDEF1234567890ABCDEF1234567890ABCD\r\n";
    expect(suffixIsPwned(body, "ABCDEF1234567890ABCDEF1234567890ABCD")).toBe(true);
  });

  it("supporte LF seul (pas que CRLF)", () => {
    const body = "ABCDEF1234567890ABCDEF1234567890ABCD:1\nDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEAD:99";
    expect(suffixIsPwned(body, "DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEAD")).toBe(true);
  });
});

describe("isPasswordPwned (network)", () => {
  const originalFetch = globalThis.fetch;
  const originalDisabled = process.env.HIBP_DISABLED;

  beforeEach(() => {
    delete process.env.HIBP_DISABLED;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalDisabled === undefined) {
      delete process.env.HIBP_DISABLED;
    } else {
      process.env.HIBP_DISABLED = originalDisabled;
    }
  });

  it("court-circuite quand HIBP_DISABLED=true (no fetch call)", async () => {
    process.env.HIBP_DISABLED = "true";
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const r = await isPasswordPwned("any-password");

    expect(r).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retourne false sur password vide sans fetch", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const r = await isPasswordPwned("");

    expect(r).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envoie SEULEMENT le prefix SHA-1 5 chars (k-anonymity)", async () => {
    let capturedUrl = "";
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1", {
        status: 200,
      });
    }) as unknown as typeof fetch;

    await isPasswordPwned("password");

    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8 → prefix 5BAA6
    expect(capturedUrl).toMatch(/\/range\/5BAA6$/);
  });

  it("retourne true quand le suffixe matche", async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    // suffix = 1E4C9B93F3F0682250B6CF8331B7EE68FD8
    globalThis.fetch = vi.fn(async () => {
      return new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:9999999\r\n", {
        status: 200,
      });
    }) as unknown as typeof fetch;

    expect(await isPasswordPwned("password")).toBe(true);
  });

  it("retourne false quand le suffixe matche pas (defense profile)", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response("DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEAD:1", {
        status: 200,
      });
    }) as unknown as typeof fetch;

    expect(await isPasswordPwned("password")).toBe(false);
  });

  it("soft-fail (false) quand fetch throw (réseau / timeout)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    expect(await isPasswordPwned("password")).toBe(false);
  });

  it("soft-fail (false) quand HIBP retourne non-2xx", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response("rate limited", { status: 429 });
    }) as unknown as typeof fetch;

    expect(await isPasswordPwned("password")).toBe(false);
  });
});
