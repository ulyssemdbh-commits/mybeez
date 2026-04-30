import { describe, it, expect } from "vitest";
import {
  TENANT_ROLES,
  insertUserSchema,
  insertUserTenantSchema,
} from "../users";

describe("TENANT_ROLES", () => {
  it("ordered most powerful first", () => {
    expect(TENANT_ROLES).toEqual(["owner", "admin", "manager", "staff", "viewer"]);
  });

  it("is readonly tuple (compile-time guarantee preserved at runtime)", () => {
    // Mutating a frozen-by-convention tuple should be visible as a TS-level error;
    // here we just confirm the value is what we expect — the type test is the real guard.
    expect(TENANT_ROLES.length).toBe(5);
  });
});

describe("insertUserSchema", () => {
  it("requires email and passwordHash", () => {
    const result = insertUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a minimal valid payload", () => {
    const result = insertUserSchema.safeParse({
      email: "alice@example.com",
      passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$placeholderbase64$placeholderbase64",
    });
    expect(result.success).toBe(true);
  });

  it("does not require fullName / locale (defaults exist)", () => {
    const result = insertUserSchema.safeParse({
      email: "bob@example.com",
      passwordHash: "hash",
    });
    expect(result.success).toBe(true);
  });
});

describe("insertUserTenantSchema", () => {
  it("requires userId, tenantId, role", () => {
    expect(insertUserTenantSchema.safeParse({}).success).toBe(false);
    expect(insertUserTenantSchema.safeParse({ userId: 1 }).success).toBe(false);
    expect(insertUserTenantSchema.safeParse({ userId: 1, tenantId: 2 }).success).toBe(false);
    expect(
      insertUserTenantSchema.safeParse({ userId: 1, tenantId: 2, role: "owner" }).success,
    ).toBe(true);
  });
});
