/**
 * Étiquettes UI pour les clés de `business_template.taxRules`.
 *
 * Source de vérité pour rendre proprement les `taxRules` d'un template
 * dans l'UI tenant (Paramètres tenant > Mon template > TVA suggérée).
 *
 * Garder en sync avec le contrat documenté dans
 * `shared/schema/templates.ts` (JSDoc de la colonne `taxRules`).
 *
 * Une clé absente d'ici n'est PAS rendue par l'UI (failsafe : on
 * préfère masquer une donnée qu'afficher du jargon).
 */

export interface TaxRuleLabel {
  /** Libellé long affiché dans l'UI tenant. */
  label: string;
  /** Libellé court (10-20 chars) pour les badges/listes serrées. */
  short: string;
  /**
   * Vrai si la valeur doit être rendue comme un pourcentage TVA (ex. 10
   * → "10%"). Faux pour les flags binaires (`exempt`).
   */
  isPercent: boolean;
}

export const TAX_RULES_LABELS: Record<string, TaxRuleLabel> = {
  defaultVat: { label: "Taux normal", short: "TVA", isPercent: true },
  reducedVat: { label: "Taux réduit", short: "Réduit", isPercent: true },
  alcohol: { label: "Alcool (restauration)", short: "Alcool", isPercent: true },
  exempt: { label: "TVA exonérée (CGI 261-4-1°)", short: "Exo. TVA", isPercent: false },
};

/** Renvoie un libellé pour une clé donnée, ou null si non documentée. */
export function getTaxRuleLabel(key: string): TaxRuleLabel | null {
  return TAX_RULES_LABELS[key] ?? null;
}

/** Formate une valeur en string lisible (`10%` ou `Exonérée`). */
export function formatTaxRuleValue(key: string, value: number): string {
  const lbl = TAX_RULES_LABELS[key];
  if (!lbl) return String(value);
  if (!lbl.isPercent) {
    return value === 1 ? "Oui" : "Non";
  }
  // Format with French decimal separator, drop trailing zeros.
  const fmt = Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(".", ",");
  return `${fmt}%`;
}
