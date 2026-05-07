import { describe, it, expect } from "vitest";
import { NAV_GROUPS, MANAGEMENT_LINKS, filterNavGroupsByModules } from "../sections";
import { getModuleSpec } from "../../../../../shared/modules";

describe("filterNavGroupsByModules", () => {
  it("returns groups intact when enabledModules is null (loading state)", () => {
    const out = filterNavGroupsByModules(NAV_GROUPS, null);
    expect(out).toEqual(NAV_GROUPS);
  });

  it("keeps links without moduleSlug regardless of enabled set", () => {
    const out = filterNavGroupsByModules(NAV_GROUPS, new Set());
    const flat = out.flatMap((g) => g.links);
    // /admin has no moduleSlug → must remain visible
    expect(flat.some((l) => l.path === "/admin")).toBe(true);
  });

  it("filters out a link whose moduleSlug is not enabled", () => {
    // Empty set: only the no-moduleSlug links remain (admin only).
    const out = filterNavGroupsByModules(NAV_GROUPS, new Set());
    const flat = out.flatMap((g) => g.links);
    expect(flat.some((l) => l.path === "/management/suppliers")).toBe(false);
    expect(flat.some((l) => l.path === "/")).toBe(false); // checklist required
  });

  it("keeps a link whose moduleSlug is in enabled set", () => {
    const out = filterNavGroupsByModules(NAV_GROUPS, new Set(["checklist", "suppliers"]));
    const flat = out.flatMap((g) => g.links);
    expect(flat.some((l) => l.path === "/")).toBe(true);
    expect(flat.some((l) => l.path === "/management/suppliers")).toBe(true);
    expect(flat.some((l) => l.path === "/management/purchases")).toBe(false);
  });

  it("drops empty groups entirely", () => {
    // No modules at all → only the "Paramètres" group (admin) survives.
    const out = filterNavGroupsByModules(NAV_GROUPS, new Set());
    expect(out.map((g) => g.label)).toEqual(["Paramètres"]);
  });

  it("preserves group order", () => {
    const out = filterNavGroupsByModules(
      NAV_GROUPS,
      new Set(["checklist", "suppliers", "employees"]),
    );
    const labels = out.map((g) => g.label);
    // Expected order: Quotidien (checklist), Gestion (suppliers), Gestion RH
    // (employees), Suivi (history attached to checklist), Paramètres.
    expect(labels).toEqual(["Quotidien", "Gestion", "Gestion RH", "Suivi", "Paramètres"]);
  });
});

describe("NAV_GROUPS — module catalog coherence", () => {
  it("every moduleSlug used in NAV_GROUPS is documented in MODULE_CATALOG", () => {
    const moduleSlugs = NAV_GROUPS.flatMap((g) => g.links)
      .map((l) => l.moduleSlug)
      .filter((s): s is string => !!s);
    for (const slug of moduleSlugs) {
      expect(getModuleSpec(slug), `nav uses moduleSlug "${slug}" but missing from catalog`).not.toBeNull();
    }
  });

  it("every management link has a moduleSlug (admin/marketing exempt)", () => {
    for (const l of MANAGEMENT_LINKS) {
      expect(l.moduleSlug, `management link ${l.path} missing moduleSlug`).toBeTruthy();
    }
  });

  it("history link is gated by the checklist module (sub-feature)", () => {
    const flat = NAV_GROUPS.flatMap((g) => g.links);
    const history = flat.find((l) => l.path === "/history");
    expect(history?.moduleSlug).toBe("checklist");
  });
});
