import { describe, it, expect } from "vitest";
import {
  MODULE_CATALOG,
  MODULE_SLUGS,
  VOCABULARY_KEYS,
  VOCABULARY_KEYS_META,
  getModuleSpec,
} from "../modules";
import { SEED_TEMPLATES } from "../../server/seed/templates";

describe("MODULE_CATALOG — invariants", () => {
  it("has unique slugs", () => {
    expect(new Set(MODULE_SLUGS).size).toBe(MODULE_SLUGS.length);
  });

  it("every slug is snake_case lowercase", () => {
    const re = /^[a-z][a-z0-9_]*$/;
    for (const m of MODULE_CATALOG) {
      expect(re.test(m.slug), `bad slug: ${m.slug}`).toBe(true);
    }
  });

  it("every module has non-empty label and description ≤140", () => {
    for (const m of MODULE_CATALOG) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.label.length).toBeLessThanOrEqual(30);
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.description.length).toBeLessThanOrEqual(140);
    }
  });

  it("category is one of core/gestion/rh", () => {
    for (const m of MODULE_CATALOG) {
      expect(["core", "gestion", "rh"]).toContain(m.category);
    }
  });

  it("at least one module is required (defensive: tenant must keep something)", () => {
    expect(MODULE_CATALOG.some((m) => m.required)).toBe(true);
  });

  it("getModuleSpec returns the spec for a known slug", () => {
    expect(getModuleSpec("checklist")?.label).toBe("Checklist quotidienne");
  });

  it("getModuleSpec returns null for unknown slug", () => {
    expect(getModuleSpec("nopeWhatever")).toBeNull();
  });

  it("every module slug used in SEED_TEMPLATES is documented in the catalog", () => {
    const seedModuleSlugs = new Set<string>();
    for (const t of SEED_TEMPLATES) {
      for (const m of t.modules) seedModuleSlugs.add(m);
    }
    for (const slug of seedModuleSlugs) {
      expect(getModuleSpec(slug), `seed uses module "${slug}" but missing from catalog`).not.toBeNull();
    }
  });
});

describe("VOCABULARY_KEYS — invariants", () => {
  it("VOCABULARY_KEYS_META covers every key", () => {
    const metaKeys = VOCABULARY_KEYS_META.map((m) => m.key).sort();
    expect(metaKeys).toEqual([...VOCABULARY_KEYS].sort());
  });

  it("each meta entry has label + description + neutral example", () => {
    for (const meta of VOCABULARY_KEYS_META) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.exampleNeutral.length).toBeGreaterThan(0);
    }
  });

  it("every vocabulary key used in SEED_TEMPLATES is whitelisted", () => {
    const seedKeys = new Set<string>();
    for (const t of SEED_TEMPLATES) {
      for (const k of Object.keys(t.vocabulary)) seedKeys.add(k);
    }
    const allowed = new Set<string>(VOCABULARY_KEYS);
    for (const k of seedKeys) {
      expect(allowed.has(k), `seed uses vocab key "${k}" not in VOCABULARY_KEYS`).toBe(true);
    }
  });
});
