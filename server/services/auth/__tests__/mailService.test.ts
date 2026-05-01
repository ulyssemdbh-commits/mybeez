import { describe, it, expect } from "vitest";
import { buildVerificationEmail, buildPasswordResetEmail } from "../mailService";

describe("buildVerificationEmail", () => {
  it("includes the verify URL in text and html", () => {
    const url = "https://example.com/verify?token=abc";
    const m = buildVerificationEmail({ email: "alice@example.com" }, url);
    expect(m.text).toContain(url);
    expect(m.html).toContain(url);
  });

  it("personalises the greeting when fullName is present", () => {
    const m = buildVerificationEmail({ email: "x@y.z", fullName: "Alice Martin" }, "u");
    expect(m.text).toContain("Bonjour Alice Martin,");
    expect(m.html).toContain("Bonjour Alice Martin,");
  });

  it("falls back to neutral greeting without fullName", () => {
    const m = buildVerificationEmail({ email: "x@y.z" }, "u");
    expect(m.text.startsWith("Bonjour,")).toBe(true);
  });

  it("subject does not leak the URL or any token-shaped material", () => {
    const m = buildVerificationEmail({ email: "x@y.z" }, "u?token=secret");
    expect(m.subject).not.toContain("token");
    expect(m.subject).not.toContain("secret");
  });

  it("mentions a 24h validity window", () => {
    const m = buildVerificationEmail({ email: "x@y.z" }, "u");
    expect(m.text).toMatch(/24h/);
  });
});

describe("buildPasswordResetEmail", () => {
  it("includes the reset URL in text and html", () => {
    const url = "https://example.com/reset?token=abc";
    const m = buildPasswordResetEmail({ email: "alice@example.com" }, url);
    expect(m.text).toContain(url);
    expect(m.html).toContain(url);
  });

  it("mentions a 1h validity window", () => {
    const m = buildPasswordResetEmail({ email: "x@y.z" }, "u");
    expect(m.text).toMatch(/1h/);
  });

  it("reassures the user that ignoring the email keeps the current password", () => {
    const m = buildPasswordResetEmail({ email: "x@y.z" }, "u");
    expect(m.text).toMatch(/mot de passe actuel reste valide/i);
  });
});
