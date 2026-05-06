import { describe, it, expect } from "vitest";
import { ICON_WHITELIST } from "../IconRenderer";
import { SEED_TEMPLATES } from "../../../../../server/seed/templates";

describe("IconRenderer.ICON_WHITELIST — coverage", () => {
  it("covers every icon used by SEED_TEMPLATES sub-templates", () => {
    const usedIcons = Array.from(
      new Set(
        SEED_TEMPLATES.filter((t) => t.parentSlug !== null)
          .map((t) => t.icon)
          .filter((i): i is string => !!i),
      ),
    );
    const missing = usedIcons.filter((name) => !(name in ICON_WHITELIST));
    expect(missing, `seed icons missing from whitelist: ${missing.join(", ")}`).toEqual([]);
  });

  it("covers every icon used by SEED_TEMPLATES top-level (Vertical)", () => {
    const usedIcons = Array.from(
      new Set(
        SEED_TEMPLATES.filter((t) => t.parentSlug === null)
          .map((t) => t.icon)
          .filter((i): i is string => !!i),
      ),
    );
    const missing = usedIcons.filter((name) => !(name in ICON_WHITELIST));
    expect(missing, `top-level icons missing from whitelist: ${missing.join(", ")}`).toEqual([]);
  });

  it("contains only PascalCase identifiers (Lucide convention)", () => {
    const re = /^[A-Z][A-Za-z0-9]+$/;
    for (const name of Object.keys(ICON_WHITELIST)) {
      expect(re.test(name), `whitelist entry "${name}" not PascalCase`).toBe(true);
    }
  });

  it("every whitelisted entry resolves to a Lucide component", () => {
    for (const [name, Icon] of Object.entries(ICON_WHITELIST)) {
      expect(Icon, `entry "${name}" is not defined`).toBeDefined();
      // Lucide ships icons as forwardRef objects (typeof "object") in some
      // builds and plain functions in others — both are valid components.
      const t = typeof Icon;
      expect(t === "function" || t === "object", `entry "${name}" type=${t}`).toBe(true);
    }
  });
});
