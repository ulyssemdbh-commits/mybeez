import { describe, it, expect } from "vitest";
import {
  TAX_RULES_LABELS,
  getTaxRuleLabel,
  formatTaxRuleValue,
} from "../taxRulesLabels";
import { SEED_TEMPLATES } from "../../../../server/seed/templates";

describe("taxRulesLabels — contract", () => {
  it("documents the four standard French keys", () => {
    expect(Object.keys(TAX_RULES_LABELS).sort()).toEqual(
      ["alcohol", "defaultVat", "exempt", "reducedVat"].sort(),
    );
  });

  it("getTaxRuleLabel returns null for unknown keys", () => {
    expect(getTaxRuleLabel("nopeWhatever")).toBeNull();
  });

  it("formatTaxRuleValue formats percents with French decimal separator", () => {
    expect(formatTaxRuleValue("defaultVat", 20)).toBe("20%");
    expect(formatTaxRuleValue("reducedVat", 5.5)).toBe("5,5%");
    expect(formatTaxRuleValue("alcohol", 20)).toBe("20%");
  });

  it("formatTaxRuleValue renders the exempt flag as Oui/Non", () => {
    expect(formatTaxRuleValue("exempt", 1)).toBe("Oui");
    expect(formatTaxRuleValue("exempt", 0)).toBe("Non");
  });

  it("falls back to plain number for unknown keys", () => {
    expect(formatTaxRuleValue("nopeKey", 42)).toBe("42");
  });

  it("every taxRules key used in the seed is documented", () => {
    const used = new Set<string>();
    for (const t of SEED_TEMPLATES) {
      for (const k of Object.keys(t.taxRules)) used.add(k);
    }
    for (const k of used) {
      expect(getTaxRuleLabel(k), `seed uses "${k}" but it is not documented`).not.toBeNull();
    }
  });
});
