/**
 * Pure helpers for matching a parsed payslip ("Bulletin de Salaire" PDF)
 * to an existing `employees` row. Three-tier strategy ported from
 * ulysseclaude — exposed standalone so unit tests don't need a DB.
 *
 * Tier order (first hit wins):
 *   1. Social security number (SSN) — exact, after stripping whitespace
 *   2. Full name — case-insensitive `firstName + lastName`
 *   3. Fuzzy — first/last permutation, substring inclusion (min 3 chars)
 */

export interface CandidateEmployee {
  id: number;
  firstName: string;
  lastName: string;
  socialSecurityNumber?: string | null;
}

export interface ParsedPayslipIdentity {
  firstName?: string | null;
  lastName?: string | null;
  socialSecurityNumber?: string | null;
}

export type MatchTier = "ssn" | "exact_name" | "fuzzy" | "none";

export interface MatchResult {
  employeeId: number | null;
  tier: MatchTier;
}

/** Strip every whitespace (incl non-breaking) for a stable SSN compare. */
function normaliseSsn(ssn: string): string {
  return ssn.replace(/\s+/g, "");
}

/**
 * Lower-case + strip diacritics so "Lefèvre" matches "Lefevre" (PDF
 * OCR often drops accents) and "Aïcha" matches "Aicha". NFD splits
 * combining marks then \p{Diacritic} removes them.
 */
function lower(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Match a parsed payslip identity against a list of employees.
 *
 * Returns the first hit by tier priority. `none` if no employee matches.
 * Pure: no DB, no IO. Caller fetches `candidates` from drizzle then
 * passes them in.
 */
export function matchEmployee(
  parsed: ParsedPayslipIdentity,
  candidates: ReadonlyArray<CandidateEmployee>,
): MatchResult {
  if (candidates.length === 0) return { employeeId: null, tier: "none" };

  // Tier 1 — SSN exact
  if (parsed.socialSecurityNumber) {
    const target = normaliseSsn(parsed.socialSecurityNumber);
    if (target.length >= 8) {
      for (const c of candidates) {
        if (!c.socialSecurityNumber) continue;
        if (normaliseSsn(c.socialSecurityNumber) === target) {
          return { employeeId: c.id, tier: "ssn" };
        }
      }
    }
  }

  // Tier 2 — exact name (case-insensitive, both fields required)
  const pf = lower(parsed.firstName);
  const pl = lower(parsed.lastName);
  if (pf && pl) {
    for (const c of candidates) {
      if (lower(c.firstName) === pf && lower(c.lastName) === pl) {
        return { employeeId: c.id, tier: "exact_name" };
      }
    }
    // Permuted (PDFs sometimes invert first/last in the header)
    for (const c of candidates) {
      if (lower(c.firstName) === pl && lower(c.lastName) === pf) {
        return { employeeId: c.id, tier: "exact_name" };
      }
    }
  }

  // Tier 3 — fuzzy (substring on each side, minimum 3 chars to avoid
  // matching "Le" / "De" prefixes against everything).
  const minFuzzyLen = 3;
  if ((pf.length >= minFuzzyLen || pl.length >= minFuzzyLen)) {
    for (const c of candidates) {
      const cf = lower(c.firstName);
      const cl = lower(c.lastName);
      const firstMatches =
        pf.length >= minFuzzyLen && (cf.includes(pf) || pf.includes(cf));
      const lastMatches =
        pl.length >= minFuzzyLen && (cl.includes(pl) || pl.includes(cl));
      if (firstMatches && lastMatches) {
        return { employeeId: c.id, tier: "fuzzy" };
      }
    }
  }

  return { employeeId: null, tier: "none" };
}
