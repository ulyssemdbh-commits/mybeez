import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeHost, classifyHost, resolveTenantByHost, clearDomainCache } from "../domainService";

describe("normalizeHost", () => {
  it("returns null for empty / undefined", () => {
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost("")).toBeNull();
    expect(normalizeHost("   ")).toBeNull();
  });

  it("lowercases", () => {
    expect(normalizeHost("Valentine.MyBeez.com")).toBe("valentine.mybeez.com");
  });

  it("strips port", () => {
    expect(normalizeHost("valentine.localhost:3000")).toBe("valentine.localhost");
    expect(normalizeHost("mybeez.com:443")).toBe("mybeez.com");
  });

  it("strips trailing dot (FQDN)", () => {
    expect(normalizeHost("mybeez.com.")).toBe("mybeez.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHost("  mybeez.com  ")).toBe("mybeez.com");
  });
});

describe("classifyHost", () => {
  const roots = ["mybeez.com", "localhost"];

  it("apex on bare root", () => {
    expect(classifyHost("mybeez.com", roots)).toEqual({ type: "apex", root: "mybeez.com" });
    expect(classifyHost("localhost", roots)).toEqual({ type: "apex", root: "localhost" });
  });

  it("subdomain on <slug>.<root>", () => {
    expect(classifyHost("valentine.mybeez.com", roots)).toEqual({
      type: "subdomain",
      root: "mybeez.com",
      subdomain: "valentine",
    });
    expect(classifyHost("valentine.localhost", roots)).toEqual({
      type: "subdomain",
      root: "localhost",
      subdomain: "valentine",
    });
  });

  it("multi-level subdomain is treated as a single (slug may contain dots, edge case)", () => {
    expect(classifyHost("staging.app.mybeez.com", roots)).toEqual({
      type: "subdomain",
      root: "mybeez.com",
      subdomain: "staging.app",
    });
  });

  it("custom domain when no root matches", () => {
    expect(classifyHost("app.salondemarie.fr", roots)).toEqual({ type: "custom" });
    expect(classifyHost("example.com", roots)).toEqual({ type: "custom" });
  });

  it("does not match a root that is a suffix substring without a dot boundary", () => {
    // 'evilmybeez.com' must not be treated as a subdomain of 'mybeez.com'
    expect(classifyHost("evilmybeez.com", roots)).toEqual({ type: "custom" });
  });
});

vi.mock("../tenantService", () => ({
  tenantService: {
    getBySlug: vi.fn(),
    getById: vi.fn(),
  },
}));

vi.mock("../../db", () => ({
  db: { select: vi.fn() },
}));

describe("resolveTenantByHost", () => {
  beforeEach(async () => {
    clearDomainCache();
    const { tenantService } = await import("../tenantService");
    (tenantService.getBySlug as ReturnType<typeof vi.fn>).mockReset();
    (tenantService.getById as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null tenant + null match for empty host", async () => {
    const result = await resolveTenantByHost(undefined);
    expect(result).toEqual({ tenant: null, match: null });
  });

  it("returns null tenant for apex host", async () => {
    process.env.ROOT_DOMAINS = "mybeez.com";
    const result = await resolveTenantByHost("mybeez.com");
    expect(result.tenant).toBeNull();
    expect(result.match?.type).toBe("apex");
  });

  it("calls tenantService.getBySlug for a subdomain", async () => {
    process.env.ROOT_DOMAINS = "mybeez.com";
    const { tenantService } = await import("../tenantService");
    const mockTenant = { id: 1, slug: "valentine" };
    (tenantService.getBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(mockTenant);

    const result = await resolveTenantByHost("valentine.mybeez.com");
    expect(tenantService.getBySlug).toHaveBeenCalledWith("valentine");
    expect(result.tenant).toEqual(mockTenant);
    expect(result.match?.type).toBe("subdomain");
  });

  it("returns null when subdomain does not match any tenant", async () => {
    process.env.ROOT_DOMAINS = "mybeez.com";
    const { tenantService } = await import("../tenantService");
    (tenantService.getBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await resolveTenantByHost("nope.mybeez.com");
    expect(result.tenant).toBeNull();
    expect(result.match?.type).toBe("subdomain");
  });

  it("works with port + uppercase combo", async () => {
    process.env.ROOT_DOMAINS = "localhost";
    const { tenantService } = await import("../tenantService");
    const mockTenant = { id: 2, slug: "maillane" };
    (tenantService.getBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(mockTenant);

    const result = await resolveTenantByHost("Maillane.LocalHost:3000");
    expect(tenantService.getBySlug).toHaveBeenCalledWith("maillane");
    expect(result.tenant).toEqual(mockTenant);
  });
});
