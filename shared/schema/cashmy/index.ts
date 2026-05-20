/**
 * CashMy (cashback) — module métier 13 myBeez.
 *
 * Marque : CashMy (rebranding du Projet-REV upstream — cf. mémoire
 * Claude `mybeez-rev-rename` et ADR 2026-05-20 §10 note rebranding).
 *
 * 16 tables au total :
 * - `cashmy_consumers` (globale, pas tenant_id) : clients finaux cashback,
 *   auth séparée des users mybeez Pro.
 * - 15 tables scopées par `tenant_id` (1 merchant CashMy = 1 tenant) :
 *   merchants, transactions, cashback_*, billings, goals, promotions,
 *   recurring_promotions, gift_cards, gift_card_purchases/balances/transfers,
 *   notifications, user_favorites.
 *
 * Voir l'ADR `docs/booksystem/adr/2026-05-20-rev-absorption.md` pour
 * le rationale d'absorption, le plan de mise en œuvre par sprints,
 * et l'inventaire exhaustif des dépendances et variables interdites
 * dans le code livré (contrainte ferme PO non-négociable).
 * CI gate dans `.github/workflows/no-replit.yml`.
 */
export * from "./consumers";
export * from "./merchants";
export * from "./transactions";
export * from "./billing";
export * from "./promotions";
export * from "./giftCards";
export * from "./notifications";
export * from "./favorites";
