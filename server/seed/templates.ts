/**
 * Seed data for `business_templates`.
 *
 * Two-level taxonomy: 3 top-level categories, each with sub-templates.
 * The seed is intentionally minimal — modules / vocabulary / categories
 * are reasonable defaults that a tenant can immediately tune via the
 * future onboarding UX. They are NOT meant to be exhaustive.
 *
 * Adding a vertical = appending a row here, no migration. Removing a
 * vertical that is referenced by tenants is blocked at the FK level
 * (`onDelete: "restrict"` on parentId; tenant.templateId — added in a
 * later PR — will use the same).
 */

export interface SeedTemplate {
  slug: string;
  parentSlug: string | null;
  name: string;
  description: string;
  modules: string[];
  defaultCategories: Record<string, unknown>;
  vocabulary: Record<string, string>;
  taxRules: Record<string, number>;
  sortOrder: number;
}

const COMMON_MODULES = ["checklist", "alfred"];
const FOOD_BUSINESS_MODULES = [...COMMON_MODULES, "suppliers", "purchases", "employees"];
const SERVICE_MODULES = [...COMMON_MODULES, "employees", "appointments"];
const RETAIL_MODULES = [...COMMON_MODULES, "suppliers", "purchases", "stock"];

// FR VAT rates (https://entreprendre.service-public.fr/vosdroits/F22573)
const VAT_FR_FOOD = { defaultVat: 10, reducedVat: 5.5, alcohol: 20 };
const VAT_FR_SERVICES = { defaultVat: 20, reducedVat: 10 };
const VAT_FR_RETAIL = { defaultVat: 20, reducedVat: 5.5 };

export const SEED_TEMPLATES: SeedTemplate[] = [
  // ==================== Top-level: commerce_de_bouche ====================
  {
    slug: "commerce_de_bouche",
    parentSlug: null,
    name: "Commerce de bouche",
    description: "Restaurants, cafés, boulangeries, traiteurs et tout commerce alimentaire avec service.",
    modules: FOOD_BUSINESS_MODULES,
    defaultCategories: {},
    vocabulary: { customer: "client" },
    taxRules: VAT_FR_FOOD,
    sortOrder: 10,
  },
  {
    slug: "restaurant",
    parentSlug: "commerce_de_bouche",
    name: "Restaurant",
    description: "Restauration assise classique. Checklist quotidienne mise/cuisine, gestion des stocks fournisseurs.",
    modules: FOOD_BUSINESS_MODULES,
    defaultCategories: {
      checklist: ["Cuisine", "Salle", "Réserve sec", "Frais", "Boissons"],
    },
    vocabulary: { item: "produit", checklist: "préparation du jour" },
    taxRules: VAT_FR_FOOD,
    sortOrder: 11,
  },
  {
    slug: "cafe",
    parentSlug: "commerce_de_bouche",
    name: "Café / Bar",
    description: "Café, bar, brasserie. Service comptoir + petite restauration.",
    modules: FOOD_BUSINESS_MODULES,
    defaultCategories: {
      checklist: ["Comptoir", "Boissons chaudes", "Boissons fraîches", "Snacking"],
    },
    vocabulary: { item: "produit" },
    taxRules: VAT_FR_FOOD,
    sortOrder: 12,
  },
  {
    slug: "boulangerie",
    parentSlug: "commerce_de_bouche",
    name: "Boulangerie / Pâtisserie",
    description: "Production fraîche quotidienne, vente sur place et à emporter.",
    modules: FOOD_BUSINESS_MODULES,
    defaultCategories: {
      checklist: ["Fournil", "Vitrine", "Caisse", "Stocks farine", "Stocks frais"],
    },
    vocabulary: { item: "référence" },
    taxRules: VAT_FR_FOOD,
    sortOrder: 13,
  },
  {
    slug: "traiteur",
    parentSlug: "commerce_de_bouche",
    name: "Traiteur",
    description: "Production sur commande, événementiel, livraison.",
    modules: FOOD_BUSINESS_MODULES,
    defaultCategories: {
      checklist: ["Production", "Conditionnement", "Livraisons", "Stocks"],
    },
    vocabulary: { item: "préparation" },
    taxRules: VAT_FR_FOOD,
    sortOrder: 14,
  },

  // ==================== Top-level: entreprise_services ====================
  {
    slug: "entreprise_services",
    parentSlug: null,
    name: "Entreprise de services",
    description: "Coiffeurs, garages, conseils, services à domicile. Activités à la prestation.",
    modules: SERVICE_MODULES,
    defaultCategories: {},
    vocabulary: { customer: "client", item: "prestation" },
    taxRules: VAT_FR_SERVICES,
    sortOrder: 20,
  },
  {
    slug: "coiffure",
    parentSlug: "entreprise_services",
    name: "Salon de coiffure / Esthétique",
    description: "Salon avec rendez-vous, prestations à la carte, vente produits annexe.",
    modules: SERVICE_MODULES,
    defaultCategories: {
      checklist: ["Postes de travail", "Bacs", "Stocks produits", "Caisse"],
    },
    vocabulary: { item: "prestation", customer: "client" },
    taxRules: VAT_FR_SERVICES,
    sortOrder: 21,
  },
  {
    slug: "garage",
    parentSlug: "entreprise_services",
    name: "Garage / Atelier",
    description: "Réparation, entretien véhicules. Devis, intervention, facturation.",
    modules: [...SERVICE_MODULES, "purchases"],
    defaultCategories: {
      checklist: ["Atelier", "Stocks pièces", "Outillage", "Sécurité"],
    },
    vocabulary: { item: "intervention", customer: "client" },
    taxRules: VAT_FR_SERVICES,
    sortOrder: 22,
  },
  {
    slug: "conseil",
    parentSlug: "entreprise_services",
    name: "Cabinet conseil / Indépendant",
    description: "Prestations intellectuelles, suivi de mission, facturation au temps ou forfait.",
    modules: COMMON_MODULES,
    defaultCategories: {},
    vocabulary: { item: "mission", customer: "client" },
    taxRules: VAT_FR_SERVICES,
    sortOrder: 23,
  },
  {
    slug: "services_domicile",
    parentSlug: "entreprise_services",
    name: "Services à domicile",
    description: "Ménage, jardinage, aide à la personne, etc. Tournées planifiées.",
    modules: SERVICE_MODULES,
    defaultCategories: {
      checklist: ["Préparation tournée", "Matériel", "Comptes-rendus"],
    },
    vocabulary: { item: "prestation", customer: "bénéficiaire" },
    taxRules: VAT_FR_SERVICES,
    sortOrder: 24,
  },

  // ==================== Top-level: retail_b2c ====================
  {
    slug: "retail_b2c",
    parentSlug: null,
    name: "Commerce de détail",
    description: "Boutiques, épiceries fines, concept stores. Vente d'articles avec stocks.",
    modules: RETAIL_MODULES,
    defaultCategories: {},
    vocabulary: { customer: "client", item: "article" },
    taxRules: VAT_FR_RETAIL,
    sortOrder: 30,
  },
  {
    slug: "boutique",
    parentSlug: "retail_b2c",
    name: "Boutique mode / Accessoires",
    description: "Prêt-à-porter, accessoires, articles non périssables.",
    modules: RETAIL_MODULES,
    defaultCategories: {
      checklist: ["Vitrine", "Cabines", "Stocks", "Caisse"],
    },
    vocabulary: { item: "article" },
    taxRules: VAT_FR_RETAIL,
    sortOrder: 31,
  },
  {
    slug: "epicerie_fine",
    parentSlug: "retail_b2c",
    name: "Épicerie fine",
    description: "Vente de produits alimentaires d'exception, fortement saisonnière.",
    modules: [...RETAIL_MODULES, "purchases"],
    defaultCategories: {
      checklist: ["Rayonnages", "Frais", "Cave", "Caisse"],
    },
    vocabulary: { item: "référence" },
    taxRules: VAT_FR_FOOD,
    sortOrder: 32,
  },
  {
    slug: "concept_store",
    parentSlug: "retail_b2c",
    name: "Concept store",
    description: "Sélection éclectique : déco, design, gourmand, lifestyle.",
    modules: RETAIL_MODULES,
    defaultCategories: {
      checklist: ["Mise en scène", "Stocks", "Caisse", "Réserve"],
    },
    vocabulary: { item: "produit" },
    taxRules: VAT_FR_RETAIL,
    sortOrder: 33,
  },
];
