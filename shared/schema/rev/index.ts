/**
 * REV (cashback) — module métier 13 myBeez.
 *
 * 16 tables au total :
 * - `rev_consumers` (globale, pas tenant_id) : clients finaux cashback,
 *   auth séparée des users mybeez Pro.
 * - 15 tables scopées par `tenant_id` (1 merchant REV = 1 tenant) :
 *   merchants, transactions, cashback_*, billings, goals, promotions,
 *   recurring_promotions, gift_cards, gift_card_purchases/balances/transfers,
 *   notifications, user_favorites.
 *
 * Voir l'ADR `docs/booksystem/adr/2026-05-20-rev-absorption.md` pour
 * le rationale d'absorption et le plan de mise en œuvre par sprints.
 *
 * Contrainte ferme zéro-Replit (ADR §2 point 11, §4) : ce module ne doit
 * contenir **aucune** référence à Replit (`REPL_*`, `@replit/`,
 * `stripe-replit-sync`). CI gate dans `.github/workflows/no-replit.yml`.
 */
export * from "./consumers";
export * from "./merchants";
export * from "./transactions";
export * from "./billing";
export * from "./promotions";
export * from "./giftCards";
export * from "./notifications";
export * from "./favorites";
