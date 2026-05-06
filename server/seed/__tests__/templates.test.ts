import { describe, it, expect } from "vitest";
import { SEED_TEMPLATES } from "../templates";

const TOP_LEVEL_SLUGS = [
  "commerce_de_bouche",
  "entreprise_services",
  "retail_b2c",
  "sante_bien_etre",
];

describe("SEED_TEMPLATES — structural invariants", () => {
  it("contains the expected top-level templates", () => {
    const topLevel = SEED_TEMPLATES.filter((t) => t.parentSlug === null);
    const slugs = topLevel.map((t) => t.slug);
    for (const expected of TOP_LEVEL_SLUGS) {
      expect(slugs, `top-level missing: ${expected}`).toContain(expected);
    }
    expect(topLevel.length).toBe(TOP_LEVEL_SLUGS.length);
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

describe("SEED_TEMPLATES — presentation invariants (sub-templates)", () => {
  const subs = SEED_TEMPLATES.filter((t) => t.parentSlug !== null);

  it("every sub-template has an icon (Lucide name)", () => {
    const lucideRe = /^[A-Z][A-Za-z0-9]+$/;
    for (const t of subs) {
      expect(t.icon, `${t.slug}: icon required`).toBeTruthy();
      expect(lucideRe.test(t.icon!), `${t.slug}: icon "${t.icon}" not PascalCase`).toBe(true);
    }
  });

  it("every sub-template has a tagline ≤80 chars", () => {
    for (const t of subs) {
      expect(t.tagline, `${t.slug}: tagline required`).toBeTruthy();
      expect(t.tagline!.length, `${t.slug}: tagline too long`).toBeLessThanOrEqual(80);
    }
  });

  it("every sub-template has idealFor ≤200 chars", () => {
    for (const t of subs) {
      expect(t.idealFor, `${t.slug}: idealFor required`).toBeTruthy();
      expect(t.idealFor!.length, `${t.slug}: idealFor too long`).toBeLessThanOrEqual(200);
    }
  });

  it("every sub-template has a coverGradient (Tailwind classes)", () => {
    const gradientRe = /^from-[a-z]+-\d+ to-[a-z]+-\d+$/;
    for (const t of subs) {
      expect(t.coverGradient, `${t.slug}: coverGradient required`).toBeTruthy();
      expect(gradientRe.test(t.coverGradient!), `${t.slug}: gradient "${t.coverGradient}" not Tailwind`).toBe(true);
    }
  });

  it("every sub-template has 3-5 featuresHighlight bullets", () => {
    for (const t of subs) {
      expect(t.featuresHighlight.length, `${t.slug}: needs 3-5 highlights`).toBeGreaterThanOrEqual(3);
      expect(t.featuresHighlight.length, `${t.slug}: needs 3-5 highlights`).toBeLessThanOrEqual(5);
      for (const f of t.featuresHighlight) {
        expect(f.length, `${t.slug}: empty feature`).toBeGreaterThan(0);
      }
    }
  });

  it("every sub-template has notIncluded as an array (may be empty)", () => {
    for (const t of subs) {
      expect(Array.isArray(t.notIncluded), `${t.slug}: notIncluded must be array`).toBe(true);
      for (const n of t.notIncluded) {
        expect(n.length, `${t.slug}: empty notIncluded entry`).toBeGreaterThan(0);
      }
    }
  });
});

describe("SEED_TEMPLATES — catalog richness", () => {
  it("has at least 20 sub-templates (catalog richness)", () => {
    const subs = SEED_TEMPLATES.filter((t) => t.parentSlug !== null);
    expect(subs.length).toBeGreaterThanOrEqual(20);
  });

  it("includes templates announced on the public landing page", () => {
    const slugs = new Set(SEED_TEMPLATES.map((t) => t.slug));
    // Landing /pour-qui mentions these — they MUST exist in the seed.
    const announced = [
      "restaurant",
      "cafe",
      "boulangerie",
      "traiteur",
      "foodtruck",
      "coiffure",
      "garage",
      "conseil",
      "services_domicile",
      "boutique",
      "epicerie_fine",
      "concept_store",
      "magasin_specialise",
    ];
    for (const a of announced) {
      expect(slugs.has(a), `landing announces "${a}" but seed missing`).toBe(true);
    }
  });
});
