/**
 * Module catalog — myBeez.
 *
 * Source de vérité pour les modules métier qu'un tenant peut activer
 * dans `tenants.modulesEnabled`. Utilisé en :
 *   - validation backend (route management/modules.ts)
 *   - rendering UI (TenantModulesSection)
 *   - invariants tests (les seeds templates ne peuvent référencer que
 *     des modules listés ici)
 *
 * `implemented: true` signifie qu'au moins un bout d'application livré
 * dépend de ce module (routes API + UI). `false` = le module est
 * référencé par des seeds templates ou la roadmap, mais le code ne le
 * livre pas encore — UI doit le rendre désactivé / "à venir".
 */

export interface ModuleSpec {
  /** Slug unique — identifiant utilisé dans `tenants.modulesEnabled`. */
  slug: string;
  /** Libellé court UI (≤30 chars). */
  label: string;
  /** Description ≤140 chars affichée sous le label. */
  description: string;
  /** Catégorie haute pour grouper l'UI. */
  category: "core" | "gestion" | "rh";
  /** Vrai si du code applicatif livré dépend déjà du module. */
  implemented: boolean;
  /** Vrai si on ne peut PAS le désactiver (module obligatoire). */
  required?: boolean;
}

export const MODULE_CATALOG: ModuleSpec[] = [
  {
    slug: "checklist",
    label: "Checklist quotidienne",
    description: "Liste d'items à cocher par jour, par catégorie et par zone.",
    category: "core",
    implemented: true,
    required: true,
  },
  {
    slug: "alfred",
    label: "Alfred IA",
    description: "Assistant conversationnel branché sur la checklist et le tenant.",
    category: "core",
    implemented: true,
  },
  {
    slug: "suppliers",
    label: "Fournisseurs",
    description: "CRUD fournisseurs (identité, contact, paiement, IBAN).",
    category: "gestion",
    implemented: true,
  },
  {
    slug: "purchases",
    label: "Achats",
    description: "Saisie et suivi des factures fournisseurs (à venir).",
    category: "gestion",
    implemented: false,
  },
  {
    slug: "expenses",
    label: "Dépenses",
    description: "Dépenses générales hors fournisseurs : abonnements, frais récurrents (à venir).",
    category: "gestion",
    implemented: false,
  },
  {
    slug: "bank",
    label: "Banque",
    description: "Mouvements bancaires : encaissements, prélèvements, rapprochement (à venir).",
    category: "gestion",
    implemented: false,
  },
  {
    slug: "cash",
    label: "Caisse",
    description: "Caisse : entrées et sorties d'espèces, fonds de caisse (à venir).",
    category: "gestion",
    implemented: false,
  },
  {
    slug: "files",
    label: "Fichiers",
    description: "Stockage des factures, contrats, documents administratifs (à venir).",
    category: "gestion",
    implemented: false,
  },
  {
    slug: "analytics",
    label: "Analytics",
    description: "KPIs, tendances, top fournisseurs, dashboards (à venir).",
    category: "gestion",
    implemented: false,
  },
  {
    slug: "stock",
    label: "Stock",
    description: "Inventaire et mouvements de stock pour le retail (à venir).",
    category: "gestion",
    implemented: false,
  },
  {
    slug: "employees",
    label: "Employés",
    description: "Fiches employés, contrats, salaires (à venir).",
    category: "rh",
    implemented: false,
  },
  {
    slug: "payroll",
    label: "Paie",
    description: "Paie mensuelle : brut, net, charges sociales (à venir).",
    category: "rh",
    implemented: false,
  },
  {
    slug: "absences",
    label: "Absences",
    description: "Congés, arrêts maladie, calendrier d'absences (à venir).",
    category: "rh",
    implemented: false,
  },
];

/** Set des slugs valides pour validation Zod. */
export const MODULE_SLUGS = MODULE_CATALOG.map((m) => m.slug);

export function getModuleSpec(slug: string): ModuleSpec | null {
  return MODULE_CATALOG.find((m) => m.slug === slug) ?? null;
}

/**
 * Clés `vocabulary` reconnues par l'application. Toute autre clé envoyée
 * à `PATCH /api/management/:slug/vocabulary` est rejetée (failsafe :
 * éviter d'accumuler du bruit dans la colonne jsonb).
 *
 * Les valeurs sont des labels libres (3-40 chars). Vide / absent =
 * fallback sur le défaut du template ou le défaut neutre français.
 */
export const VOCABULARY_KEYS = ["item", "checklist", "customer"] as const;
export type VocabularyKey = (typeof VOCABULARY_KEYS)[number];

export interface VocabularyKeyMeta {
  key: VocabularyKey;
  label: string;
  description: string;
  exampleNeutral: string;
}

export const VOCABULARY_KEYS_META: VocabularyKeyMeta[] = [
  {
    key: "item",
    label: "Élément",
    description: "Le mot que vous utilisez pour un élément de la checklist.",
    exampleNeutral: "élément",
  },
  {
    key: "checklist",
    label: "Checklist",
    description: "Le nom que vous donnez à la liste à cocher du jour.",
    exampleNeutral: "checklist",
  },
  {
    key: "customer",
    label: "Client",
    description: "Comment vous appelez votre clientèle (client, patient, élève…).",
    exampleNeutral: "client",
  },
];
