import { describe, it, expect } from "vitest";
import { SEED_TEMPLATES } from "../templates";

describe("SEED_TEMPLATES — structural invariants", () => {
  it("contains at least the 3 expected top-level templates", () => {
    const topLevel = SEED_TEMPLATES.filter((t) => t.parentSlug === null);
    const slugs = topLevel.map((t) => t.slug);
    expect(slugs).toContain("commerce_de_bouche");
    expect(slugs).toContain("entreprise_services");
    expect(slugs).toContain("retail_b2c");
  });

  it("has all unique slugs", () => {
    const slugs = SEED_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every parentSlug points to an existing top-level slug", () => {
    const topLevelSlugs = new Set(
      SEED_TEMPLATES.filter((t) => t.parentSlug === null).map((t) => t.slug),
    );
    const subs = SEED_TEMPLATES.filter((t) => t.parentSlug !== null);
    for (const t of subs) {
      expect(topLevelSlugs.has(t.parentSlug!), `parent of ${t.slug}`).toBe(true);
    }
  });

  it("no template parents itself (no cycle even at depth 1)", () => {
    for (const t of SEED_TEMPLATES) {
      expect(t.parentSlug, `${t.slug} cannot parent itself`).not.toBe(t.slug);
    }
  });

  it("no template references itself transitively (taxonomy is exactly 2 levels)", () => {
    // Sub-templates must have a top-level parent (parentSlug === null
    // for that parent). No 3-level chain allowed.
    const bySlug = new Map(SEED_TEMPLATES.map((t) => [t.slug, t]));
    const subs = SEED_TEMPLATES.filter((t) => t.parentSlug !== null);
    for (const t of subs) {
      const parent = bySlug.get(t.parentSlug!);
      expect(parent, `${t.slug}'s parent must exist`).toBeDefined();
      expect(parent!.parentSlug, `${t.slug}'s parent must be top-level`).toBeNull();
    }
  });

  it("each top-level has at least one sub-template", () => {
    const tops = SEED_TEMPLATES.filter((t) => t.parentSlug === null);
    for (const top of tops) {
      const children = SEED_TEMPLATES.filter((t) => t.parentSlug === top.slug);
      expect(children.length, `${top.slug} should have children`).toBeGreaterThanOrEqual(1);
    }
  });

  it("every template has non-empty name and slug uses snake_case", () => {
    const slugRe = /^[a-z][a-z0-9_]*$/;
    for (const t of SEED_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(slugRe.test(t.slug), `slug ${t.slug} not snake_case`).toBe(true);
    }
  });

  it("modules contains only known module slugs", () => {
    const ALLOWED = new Set([
      "checklist",
      "alfred",
      "suppliers",
      "purchases",
      "employees",
      "appointments",
      "stock",
    ]);
    for (const t of SEED_TEMPLATES) {
      for (const m of t.modules) {
        expect(ALLOWED.has(m), `${t.slug}: unknown module "${m}"`).toBe(true);
      }
    }
  });

  it("sortOrder is unique per group (top-level vs each parent's children)", () => {
    const groupOf = (t: (typeof SEED_TEMPLATES)[number]) => t.parentSlug ?? "__top__";
    const orders = new Map<string, Set<number>>();
    for (const t of SEED_TEMPLATES) {
      const g = groupOf(t);
      const set = orders.get(g) ?? new Set<number>();
      expect(set.has(t.sortOrder), `duplicate sortOrder ${t.sortOrder} in group ${g}`).toBe(false);
      set.add(t.sortOrder);
      orders.set(g, set);
    }
  });
});
