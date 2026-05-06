import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../prompt";
import type { Tenant } from "../../../../shared/schema/tenants";

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 1,
    clientCode: "12345678",
    slug: "demo",
    name: "Démo",
    shortName: null,
    templateId: null,
    businessType: "restaurant",
    vocabulary: {},
    modulesEnabled: [],
    pinCode: null,
    adminCode: null,
    email: null,
    phone: null,
    address: null,
    timezone: "Europe/Paris",
    isActive: true,
    features: {},
    theme: {},
    config: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Tenant;
}

describe("buildSystemPrompt", () => {
  it("uses the tenant's name (no hardcoded restaurant identity)", () => {
    const prompt = buildSystemPrompt(makeTenant({ name: "Salon de Marie" }));
    expect(prompt).toContain("Salon de Marie");
  });

  it("contains no leftover restaurant-specific identifiers", () => {
    const prompt = buildSystemPrompt(makeTenant({ name: "Garage Test" }));
    // Past Valentine/Maillane hardcoded names — must not leak.
    expect(prompt).not.toMatch(/Valentine|Maillane/i);
    // Sushi-bar / VI/TH translation hint — purged.
    expect(prompt).not.toMatch(/Sushi/i);
    expect(prompt).not.toMatch(/FR ?↔ ?VI/i);
    // Cuisine/Réserve/Sushi Bar listed as zones — was hardcoded too.
    expect(prompt).not.toMatch(/Cuisine, Sushi Bar/);
  });

  it("applies vocabulary overrides when provided", () => {
    const prompt = buildSystemPrompt(
      makeTenant({
        name: "Coiffure Étoile",
        vocabulary: { item: "prestation", customer: "client" },
      }),
    );
    expect(prompt).toContain("prestation");
    expect(prompt).toContain("client");
  });

  it("falls back to neutral defaults when vocabulary is empty", () => {
    const prompt = buildSystemPrompt(makeTenant({ name: "Boulangerie X", vocabulary: {} }));
    // "élément" is the neutral default for `item`
    expect(prompt).toContain("élément");
  });

  it("works when vocabulary is null (legacy DB rows)", () => {
    // Some older tenants might have null instead of empty object.
    const tenant = makeTenant({ name: "Old Tenant" });
    // Force-cast to simulate legacy nullable
    (tenant as unknown as { vocabulary: null }).vocabulary = null;
    const prompt = buildSystemPrompt(tenant);
    expect(prompt).toContain("Old Tenant");
  });

  it("always opens with 'Tu es Alfred,' for prompt-injection consistency", () => {
    const prompt = buildSystemPrompt(makeTenant());
    expect(prompt.startsWith("Tu es Alfred,")).toBe(true);
  });
});
