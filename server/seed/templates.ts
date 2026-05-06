/**
 * Seed data for `business_templates`.
 *
 * Two-level taxonomy: 4 top-level verticals, each with sub-templates.
 * Each sub-template carries:
 *   - functional defaults: modules, defaultCategories, vocabulary, taxRules
 *   - presentation: icon (Lucide name), tagline, idealFor, coverGradient,
 *     featuresHighlight, notIncluded
 *
 * Adding a vertical = appending a row here, no migration. Removing a
 * vertical that is referenced by tenants is blocked at the FK level
 * (`onDelete: "restrict"`).
 *
 * Icons reference `lucide-react` exports — keep names in sync with what
 * the front-end imports in the picker.
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
  /** Lucide icon name (eg. "Utensils"). Required for sub-templates. */
  icon: string | null;
  /** Short marketing line (≤80 chars). Required for sub-templates. */
  tagline: string | null;
  /** Audience hint (≤200 chars). Required for sub-templates. */
  idealFor: string | null;
  /** Tailwind gradient classes for the picker card cover. */
  coverGradient: string | null;
  /** 3-5 concrete bullets. Required for sub-templates. */
  featuresHighlight: string[];
  /** Honest "not included" list. Optional. */
  notIncluded: string[];
  sortOrder: number;
}

const COMMON_MODULES = ["checklist", "alfred"];
const FOOD_BUSINESS_MODULES = [...COMMON_MODULES, "suppliers", "purchases", "employees"];
const SERVICE_MODULES = [...COMMON_MODULES, "employees"];
const SERVICE_WITH_PURCHASES = [...SERVICE_MODULES, "purchases"];
const RETAIL_MODULES = [...COMMON_MODULES, "suppliers", "purchases", "stock"];
const HEALTH_MODULES = [...COMMON_MODULES, "employees"];

// FR VAT rates (https://entreprendre.service-public.fr/vosdroits/F22573)
// Keys consumed by UI labels — see docs/templates-tax-keys.md.
//   defaultVat : taux normalement appliqué sur la facturation courante
//   reducedVat : taux réduit appliqué sur certaines lignes (ex. à emporter)
//   alcohol    : taux spécifique pour l'alcool en restauration
//   exempt     : marque le métier comme exonéré de TVA (santé)
const VAT_FR_FOOD = { defaultVat: 10, reducedVat: 5.5, alcohol: 20 };
const VAT_FR_SERVICES = { defaultVat: 20, reducedVat: 10 };
const VAT_FR_RETAIL = { defaultVat: 20, reducedVat: 5.5 };
const VAT_FR_HEALTH_EXEMPT = { defaultVat: 0, exempt: 1 };

// Picker gradient palette — one per vertical for visual consistency.
const GRADIENT_FOOD = "from-amber-500 to-orange-500";
const GRADIENT_SERVICES = "from-blue-500 to-cyan-500";
const GRADIENT_RETAIL = "from-purple-500 to-pink-500";
const GRADIENT_HEALTH = "from-emerald-500 to-teal-500";

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
    icon: "UtensilsCrossed",
    tagline: "Tout ce qui se mange et se sert",
    idealFor: null,
    coverGradient: GRADIENT_FOOD,
    featuresHighlight: [],
    notIncluded: [],
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
    vocabulary: { item: "produit", checklist: "préparation du jour", customer: "client" },
    taxRules: VAT_FR_FOOD,
    icon: "ChefHat",
    tagline: "Restauration assise, mise en place et stocks",
    idealFor: "Restaurants traditionnels, bistros, brasseries — 1 à 30 couverts simultanés.",
    coverGradient: GRADIENT_FOOD,
    featuresHighlight: [
      "Checklist Cuisine + Salle + Réserve préseedée",
      "Modules fournisseurs, achats, employés activés",
      "TVA 10% par défaut, 5,5% à emporter, 20% alcool",
      "Vocabulaire « produit » + « préparation du jour »",
    ],
    notIncluded: [
      "Réservations en ligne (à venir)",
      "Connexion caisse / TPE (à venir)",
    ],
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
    vocabulary: { item: "produit", customer: "client" },
    taxRules: VAT_FR_FOOD,
    icon: "Coffee",
    tagline: "Service comptoir + boissons + petite restauration",
    idealFor: "Cafés de quartier, bars, brasseries de jour — service rapide au comptoir.",
    coverGradient: GRADIENT_FOOD,
    featuresHighlight: [
      "Checklist Comptoir + Boissons + Snacking",
      "Suivi fournisseurs (boissons, café, snacking)",
      "TVA 10% boissons, 20% alcool",
      "Idéal pour staff tournant (PIN tablette à venir)",
    ],
    notIncluded: ["Programmes fidélité (à venir)"],
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
    vocabulary: { item: "référence", customer: "client" },
    taxRules: VAT_FR_FOOD,
    icon: "Croissant",
    tagline: "Production fraîche quotidienne, vente sur place et à emporter",
    idealFor: "Boulangeries-pâtisseries artisanales, traiteurs sucrés, bakery cafés.",
    coverGradient: GRADIENT_FOOD,
    featuresHighlight: [
      "Checklist Fournil + Vitrine + Stocks préseedée",
      "Vocabulaire « référence » (≠ produit, plus précis)",
      "TVA 5,5% à emporter par défaut",
      "Suivi fournisseurs farine + frais",
    ],
    notIncluded: ["Préco quantitative production (à venir)"],
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
    vocabulary: { item: "préparation", customer: "client" },
    taxRules: VAT_FR_FOOD,
    icon: "Soup",
    tagline: "Production sur commande, événementiel, livraison",
    idealFor: "Traiteurs événementiels, food caterers, services de plateaux-repas pro.",
    coverGradient: GRADIENT_FOOD,
    featuresHighlight: [
      "Checklist Production + Conditionnement + Livraisons",
      "Vocabulaire « préparation » centré commandes",
      "Achats matières premières + emballages",
      "TVA 10% / 5,5% selon livraison ou consommation",
    ],
    notIncluded: ["Calendrier événements (à venir)"],
    sortOrder: 14,
  },
  {
    slug: "foodtruck",
    parentSlug: "commerce_de_bouche",
    name: "Food truck",
    description: "Restauration mobile, marchés, événements, tournées urbaines.",
    modules: FOOD_BUSINESS_MODULES,
    defaultCategories: {
      checklist: ["Avant-service", "Service", "Stocks véhicule", "Fin de tournée"],
    },
    vocabulary: { item: "produit", customer: "client" },
    taxRules: VAT_FR_FOOD,
    icon: "Truck",
    tagline: "Restauration mobile, marchés et tournées urbaines",
    idealFor: "Food trucks, vans gourmands, traiteurs ambulants — 1 à 3 personnes en service.",
    coverGradient: GRADIENT_FOOD,
    featuresHighlight: [
      "Checklist Avant-service + Stocks véhicule",
      "Suivi fournisseurs et achats simplifié",
      "Vocabulaire mobile « tournée » (à venir)",
      "TVA 10% par défaut",
    ],
    notIncluded: ["Calendrier emplacements (à venir)"],
    sortOrder: 15,
  },
  {
    slug: "pizzeria",
    parentSlug: "commerce_de_bouche",
    name: "Pizzeria",
    description: "Pizza sur place, à emporter ou livraison. Service rapide.",
    modules: FOOD_BUSINESS_MODULES,
    defaultCategories: {
      checklist: ["Four", "Préparations", "Caisse", "Stocks farine + frais", "Livraison"],
    },
    vocabulary: { item: "produit", customer: "client" },
    taxRules: VAT_FR_FOOD,
    icon: "Pizza",
    tagline: "Pizza sur place, à emporter et livraison",
    idealFor: "Pizzerias artisanales, kiosques pizza, points livraison — solo ou équipe ≤8.",
    coverGradient: GRADIENT_FOOD,
    featuresHighlight: [
      "Checklist Four + Préparations + Livraison",
      "Suivi fournisseurs farine, fromage, charcuterie",
      "TVA 5,5% à emporter, 10% sur place",
      "Idéal volume soir + week-end",
    ],
    notIncluded: ["Intégration plateformes livraison (à venir)"],
    sortOrder: 16,
  },
  {
    slug: "dark_kitchen",
    parentSlug: "commerce_de_bouche",
    name: "Dark kitchen / Cloud kitchen",
    description: "Cuisine de production 100% livraison, multi-marques possible.",
    modules: FOOD_BUSINESS_MODULES,
    defaultCategories: {
      checklist: ["Production", "Picking commandes", "Emballage", "Stocks", "Sortie livreurs"],
    },
    vocabulary: { item: "produit", customer: "client" },
    taxRules: VAT_FR_FOOD,
    icon: "ChefHat",
    tagline: "Cuisine 100% livraison, multi-marques possible",
    idealFor: "Restaurants virtuels, cuisines de production sans salle, multi-enseignes.",
    coverGradient: GRADIENT_FOOD,
    featuresHighlight: [
      "Checklist Production + Picking + Sortie livreurs",
      "Suivi fournisseurs et achats matières",
      "TVA 5,5% (à emporter livraison)",
      "Vocabulaire orienté flux commandes",
    ],
    notIncluded: ["Connexion plateformes (Uber/Deliveroo) à venir"],
    sortOrder: 17,
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
    icon: "Briefcase",
    tagline: "Activités à la prestation et au rendez-vous",
    idealFor: null,
    coverGradient: GRADIENT_SERVICES,
    featuresHighlight: [],
    notIncluded: [],
    sortOrder: 20,
  },
  {
    slug: "coiffure",
    parentSlug: "entreprise_services",
    name: "Salon de coiffure",
    description: "Salon avec rendez-vous, prestations à la carte, vente produits annexe.",
    modules: SERVICE_MODULES,
    defaultCategories: {
      checklist: ["Postes de travail", "Bacs", "Stocks produits", "Caisse"],
    },
    vocabulary: { item: "prestation", customer: "client" },
    taxRules: VAT_FR_SERVICES,
    icon: "Scissors",
    tagline: "Rendez-vous, prestations à la carte, vente boutique",
    idealFor: "Salons de coiffure 1-10 postes, indépendants, salons mixtes femmes/hommes.",
    coverGradient: GRADIENT_SERVICES,
    featuresHighlight: [
      "Checklist Postes + Bacs + Stocks produits",
      "Vocabulaire « prestation » (≠ produit)",
      "TVA 20% prestation, 10% à emporter (vente produits)",
      "Suivi des employés (équipes tournantes)",
    ],
    notIncluded: ["Prise de RDV en ligne (à venir)"],
    sortOrder: 21,
  },
  {
    slug: "garage",
    parentSlug: "entreprise_services",
    name: "Garage / Atelier auto",
    description: "Réparation, entretien véhicules. Devis, intervention, facturation.",
    modules: SERVICE_WITH_PURCHASES,
    defaultCategories: {
      checklist: ["Atelier", "Stocks pièces", "Outillage", "Sécurité"],
    },
    vocabulary: { item: "intervention", customer: "client" },
    taxRules: VAT_FR_SERVICES,
    icon: "Wrench",
    tagline: "Réparation, entretien, devis et factures",
    idealFor: "Garages indépendants, ateliers carrosserie, mécaniciens tous-types.",
    coverGradient: GRADIENT_SERVICES,
    featuresHighlight: [
      "Checklist Atelier + Sécurité + Outillage",
      "Vocabulaire « intervention » (≠ produit)",
      "Achats pièces détachées activés",
      "Suivi employés mécaniciens / carrossiers",
    ],
    notIncluded: ["OBD / diagnostic embarqué (à venir)"],
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
    icon: "Briefcase",
    tagline: "Prestations intellectuelles, suivi de mission",
    idealFor: "Cabinets conseil, freelances, sociétés services pro, agences digitales.",
    coverGradient: GRADIENT_SERVICES,
    featuresHighlight: [
      "Vocabulaire « mission » (suivi clients/prestations)",
      "Modules essentiels : checklist + Alfred",
      "TVA 20% standard prestations",
      "Léger pour TPE et freelances",
    ],
    notIncluded: [
      "Time-tracking (à venir)",
      "Devis / facturation auto (à venir)",
    ],
    sortOrder: 23,
  },
  {
    slug: "services_domicile",
    parentSlug: "entreprise_services",
    name: "Services à domicile",
    description: "Ménage, jardinage, aide à la personne. Tournées planifiées.",
    modules: SERVICE_MODULES,
    defaultCategories: {
      checklist: ["Préparation tournée", "Matériel", "Comptes-rendus"],
    },
    vocabulary: { item: "prestation", customer: "bénéficiaire" },
    taxRules: VAT_FR_SERVICES,
    icon: "Home",
    tagline: "Ménage, jardinage, aide — tournées planifiées",
    idealFor: "Sociétés services à la personne agréées, jardiniers, agences ménage.",
    coverGradient: GRADIENT_SERVICES,
    featuresHighlight: [
      "Checklist Préparation tournée + Matériel + CR",
      "Vocabulaire « bénéficiaire » (régulé services à la personne)",
      "Suivi employés / intervenants",
      "TVA 10% réduite (services à la personne agréés)",
    ],
    notIncluded: [
      "Planification automatique tournées (à venir)",
      "Génération CESU / NOVA (à venir)",
    ],
    sortOrder: 24,
  },
  {
    slug: "pressing",
    parentSlug: "entreprise_services",
    name: "Pressing / Blanchisserie",
    description: "Nettoyage textile, retouches, ramassage pro.",
    modules: SERVICE_WITH_PURCHASES,
    defaultCategories: {
      checklist: ["Réception", "Production", "Caisse / livraison", "Stocks consommables"],
    },
    vocabulary: { item: "prestation", customer: "client" },
    taxRules: VAT_FR_SERVICES,
    icon: "Shirt",
    tagline: "Nettoyage textile, retouches, ramassage pro",
    idealFor: "Pressings de quartier, blanchisseries, services BtoB hôtellerie/restauration.",
    coverGradient: GRADIENT_SERVICES,
    featuresHighlight: [
      "Checklist Réception + Production + Caisse",
      "Vocabulaire « prestation »",
      "Achats consommables (lessives, emballages)",
      "TVA 20% standard",
    ],
    notIncluded: ["Suivi pièces RFID / étiquettes (à venir)"],
    sortOrder: 25,
  },
  {
    slug: "auto_ecole",
    parentSlug: "entreprise_services",
    name: "Auto-école",
    description: "Formation au permis de conduire (B, A, BE…), code et conduite.",
    modules: SERVICE_MODULES,
    defaultCategories: {
      checklist: ["Véhicules / sécurité", "Salle code", "Élèves du jour", "Administratif"],
    },
    vocabulary: { item: "leçon", customer: "élève" },
    taxRules: VAT_FR_SERVICES,
    icon: "Car",
    tagline: "Formation au permis, code et conduite",
    idealFor: "Auto-écoles indépendantes, antennes locales, écoles motos B+A.",
    coverGradient: GRADIENT_SERVICES,
    featuresHighlight: [
      "Checklist Véhicules + Salle code + Élèves du jour",
      "Vocabulaire « élève » + « leçon »",
      "Suivi moniteurs",
      "TVA 20% prestations enseignement",
    ],
    notIncluded: [
      "Calendrier leçons (à venir)",
      "Suivi heures officielles administratif RNF (à venir)",
    ],
    sortOrder: 26,
  },
  {
    slug: "salle_sport",
    parentSlug: "entreprise_services",
    name: "Salle de sport / Coaching",
    description: "Salle d'entraînement, coaching individuel, abonnements mensuels.",
    modules: SERVICE_MODULES,
    defaultCategories: {
      checklist: ["Plateau", "Vestiaires", "Cardio / musculation", "Caisse / accueil"],
    },
    vocabulary: { item: "séance", customer: "adhérent" },
    taxRules: VAT_FR_SERVICES,
    icon: "Dumbbell",
    tagline: "Plateau, coaching, abonnements mensuels",
    idealFor: "Salles de sport indépendantes, studios fitness, coachs avec un local.",
    coverGradient: GRADIENT_SERVICES,
    featuresHighlight: [
      "Checklist Plateau + Vestiaires + Caisse",
      "Vocabulaire « adhérent » + « séance »",
      "Suivi coachs / instructeurs",
      "TVA 20% (10% si club agréé sport-santé)",
    ],
    notIncluded: [
      "Gestion abonnements / prélèvements (à venir)",
      "Réservation cours collectifs (à venir)",
    ],
    sortOrder: 27,
  },
  {
    slug: "photographe",
    parentSlug: "entreprise_services",
    name: "Photographe / Vidéaste",
    description: "Studios photo, mariages, portraits, corporate, post-production.",
    modules: COMMON_MODULES,
    defaultCategories: {
      checklist: ["Préparation séance", "Matériel", "Post-production", "Livraison fichiers"],
    },
    vocabulary: { item: "prestation", customer: "client" },
    taxRules: VAT_FR_SERVICES,
    icon: "Camera",
    tagline: "Studio, mariages, portraits, post-production",
    idealFor: "Photographes / vidéastes indépendants, petits studios, agences créatives.",
    coverGradient: GRADIENT_SERVICES,
    featuresHighlight: [
      "Checklist Préparation séance + Post-production",
      "Vocabulaire « prestation »",
      "Léger pour solo / studios ≤3 personnes",
      "TVA 20% (5,5% droits d'auteur photo)",
    ],
    notIncluded: [
      "Galeries clients en ligne (à venir)",
      "Contrats / cession droits (à venir)",
    ],
    sortOrder: 28,
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
    icon: "ShoppingBag",
    tagline: "Vente d'articles avec stocks",
    idealFor: null,
    coverGradient: GRADIENT_RETAIL,
    featuresHighlight: [],
    notIncluded: [],
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
    vocabulary: { item: "article", customer: "client" },
    taxRules: VAT_FR_RETAIL,
    icon: "ShoppingBag",
    tagline: "Prêt-à-porter, accessoires, articles non périssables",
    idealFor: "Boutiques mode indépendantes, multimarques, concept-stores ≤3 vendeuses.",
    coverGradient: GRADIENT_RETAIL,
    featuresHighlight: [
      "Checklist Vitrine + Cabines + Stocks + Caisse",
      "Vocabulaire « article » + module stock",
      "Suivi fournisseurs + achats",
      "TVA 20% standard, 5,5% sur le livre",
    ],
    notIncluded: ["E-shop synchro (à venir)"],
    sortOrder: 31,
  },
  {
    slug: "epicerie_fine",
    parentSlug: "retail_b2c",
    name: "Épicerie fine",
    description: "Produits alimentaires d'exception, fortement saisonniers.",
    modules: [...RETAIL_MODULES],
    defaultCategories: {
      checklist: ["Rayonnages", "Frais", "Cave", "Caisse"],
    },
    vocabulary: { item: "référence", customer: "client" },
    taxRules: VAT_FR_FOOD,
    icon: "Wine",
    tagline: "Produits alimentaires d'exception et saisonniers",
    idealFor: "Épiceries fines de quartier, caves à vin, boutiques produits régionaux.",
    coverGradient: GRADIENT_RETAIL,
    featuresHighlight: [
      "Checklist Rayonnages + Frais + Cave",
      "Vocabulaire « référence »",
      "TVA alimentaire (5,5% / 10% / 20% alcool)",
      "Suivi fournisseurs + achats saisonniers",
    ],
    notIncluded: ["DLC / DLUO automatique (à venir)"],
    sortOrder: 32,
  },
  {
    slug: "concept_store",
    parentSlug: "retail_b2c",
    name: "Concept store",
    description: "Sélection éclectique : déco, design, lifestyle, papeterie.",
    modules: RETAIL_MODULES,
    defaultCategories: {
      checklist: ["Mise en scène", "Stocks", "Caisse", "Réserve"],
    },
    vocabulary: { item: "produit", customer: "client" },
    taxRules: VAT_FR_RETAIL,
    icon: "Lamp",
    tagline: "Sélection éclectique : déco, design, lifestyle",
    idealFor: "Concept stores urbains, boutiques curated, multimarques mode + déco.",
    coverGradient: GRADIENT_RETAIL,
    featuresHighlight: [
      "Checklist Mise en scène + Stocks + Caisse",
      "Vocabulaire « produit »",
      "Module stock activé",
      "TVA 20% standard",
    ],
    notIncluded: ["Vendor management multi-marques (à venir)"],
    sortOrder: 33,
  },
  {
    slug: "fleuriste",
    parentSlug: "retail_b2c",
    name: "Fleuriste",
    description: "Fleurs coupées, bouquets, plantes, événementiel mariage.",
    modules: RETAIL_MODULES,
    defaultCategories: {
      checklist: ["Atelier compositions", "Vitrine", "Frais", "Caisse"],
    },
    vocabulary: { item: "composition", customer: "client" },
    taxRules: { defaultVat: 10, reducedVat: 10, alcohol: 20 },
    icon: "Flower",
    tagline: "Fleurs coupées, bouquets, événementiel",
    idealFor: "Fleuristes de quartier, ateliers compositions, prestataires événementiels.",
    coverGradient: GRADIENT_RETAIL,
    featuresHighlight: [
      "Checklist Atelier compositions + Frais + Vitrine",
      "Vocabulaire « composition »",
      "TVA 10% (fleurs naturelles)",
      "Suivi fournisseurs + commandes événementielles",
    ],
    notIncluded: ["Réservation événementiel (à venir)"],
    sortOrder: 34,
  },
  {
    slug: "librairie",
    parentSlug: "retail_b2c",
    name: "Librairie",
    description: "Livres neufs, papeterie, jeux. Souvent indépendante de quartier.",
    modules: RETAIL_MODULES,
    defaultCategories: {
      checklist: ["Vitrine", "Réception", "Caisse", "Stocks"],
    },
    vocabulary: { item: "référence", customer: "client" },
    taxRules: { defaultVat: 5.5, reducedVat: 5.5 },
    icon: "BookOpen",
    tagline: "Livres, papeterie, jeux — librairie indépendante",
    idealFor: "Librairies indépendantes de quartier, librairies BD, papeteries-jeux.",
    coverGradient: GRADIENT_RETAIL,
    featuresHighlight: [
      "Checklist Vitrine + Réception + Stocks",
      "Vocabulaire « référence »",
      "TVA 5,5% (livre)",
      "Suivi fournisseurs / éditeurs",
    ],
    notIncluded: [
      "Connexion Dilicom / SOFEDIS (à venir)",
      "Réservation client (à venir)",
    ],
    sortOrder: 35,
  },
  {
    slug: "magasin_specialise",
    parentSlug: "retail_b2c",
    name: "Magasin spécialisé",
    description: "Boutique mono-univers : sport, jouets, animalerie, bricolage…",
    modules: RETAIL_MODULES,
    defaultCategories: {
      checklist: ["Vitrine", "Rayons", "Stocks", "Caisse"],
    },
    vocabulary: { item: "article", customer: "client" },
    taxRules: VAT_FR_RETAIL,
    icon: "Store",
    tagline: "Boutique mono-univers : sport, jouets, animalerie…",
    idealFor: "Magasins spécialisés indépendants ou affiliés, boutiques mono-thème.",
    coverGradient: GRADIENT_RETAIL,
    featuresHighlight: [
      "Checklist Vitrine + Rayons + Stocks",
      "Vocabulaire « article » générique",
      "Modules suppliers + purchases + stock",
      "TVA 20% (à ajuster selon univers)",
    ],
    notIncluded: ["Catalogue spécifique secteur (à venir)"],
    sortOrder: 36,
  },

  // ==================== Top-level: sante_bien_etre ====================
  {
    slug: "sante_bien_etre",
    parentSlug: null,
    name: "Santé & bien-être",
    description: "Professions médicales et paramédicales, soins du corps.",
    modules: HEALTH_MODULES,
    defaultCategories: {},
    vocabulary: { customer: "patient", item: "consultation" },
    taxRules: VAT_FR_HEALTH_EXEMPT,
    icon: "HeartPulse",
    tagline: "Cabinets médicaux, paramédicaux, soins du corps",
    idealFor: null,
    coverGradient: GRADIENT_HEALTH,
    featuresHighlight: [],
    notIncluded: [],
    sortOrder: 40,
  },
  {
    slug: "kine",
    parentSlug: "sante_bien_etre",
    name: "Kinésithérapeute",
    description: "Cabinet de kinésithérapie, libéral seul ou en groupe.",
    modules: HEALTH_MODULES,
    defaultCategories: {
      checklist: ["Salle de soins", "Matériel", "Patients du jour", "Administratif"],
    },
    vocabulary: { customer: "patient", item: "consultation" },
    taxRules: VAT_FR_HEALTH_EXEMPT,
    icon: "Activity",
    tagline: "Cabinet de kinésithérapie libéral",
    idealFor: "Kinés libéraux, cabinets groupés, centres rééducation indépendants.",
    coverGradient: GRADIENT_HEALTH,
    featuresHighlight: [
      "Checklist Salle de soins + Matériel + Patients",
      "Vocabulaire « patient » + « consultation »",
      "TVA exonérée (CGI 261-4-1°)",
      "Suivi des collaborateurs",
    ],
    notIncluded: [
      "Télétransmission Améli (à venir)",
      "Agenda patients (à venir)",
    ],
    sortOrder: 41,
  },
  {
    slug: "dentiste",
    parentSlug: "sante_bien_etre",
    name: "Cabinet dentaire",
    description: "Chirurgiens-dentistes, omnipratique, orthodontie, implantologie.",
    modules: HEALTH_MODULES,
    defaultCategories: {
      checklist: ["Salles de soins", "Stérilisation", "Patients du jour", "Administratif"],
    },
    vocabulary: { customer: "patient", item: "consultation" },
    taxRules: VAT_FR_HEALTH_EXEMPT,
    icon: "Smile",
    tagline: "Cabinet dentaire libéral ou en groupe",
    idealFor: "Cabinets dentaires libéraux, centres dentaires, SCM dentaires.",
    coverGradient: GRADIENT_HEALTH,
    featuresHighlight: [
      "Checklist Salles + Stérilisation + Patients",
      "Vocabulaire « patient » + « consultation »",
      "TVA exonérée (CGI 261-4-1°)",
      "Suivi praticiens + assistantes",
    ],
    notIncluded: [
      "Logiciel patient cardex (à venir)",
      "Connexion FSE / SCOR (à venir)",
    ],
    sortOrder: 42,
  },
  {
    slug: "osteopathie",
    parentSlug: "sante_bien_etre",
    name: "Ostéopathe",
    description: "Cabinet d'ostéopathie, libéral seul ou en groupe.",
    modules: HEALTH_MODULES,
    defaultCategories: {
      checklist: ["Salle de soins", "Matériel", "Patients du jour", "Administratif"],
    },
    vocabulary: { customer: "patient", item: "consultation" },
    taxRules: VAT_FR_HEALTH_EXEMPT,
    icon: "Heart",
    tagline: "Cabinet d'ostéopathie libéral",
    idealFor: "Ostéopathes libéraux, cabinets pluriprofessionnels, centres bien-être.",
    coverGradient: GRADIENT_HEALTH,
    featuresHighlight: [
      "Checklist Salle de soins + Matériel + Patients",
      "Vocabulaire « patient » + « consultation »",
      "TVA exonérée (profession para-médicale réglementée)",
      "Léger pour solo et petites structures",
    ],
    notIncluded: ["Agenda + rappels SMS (à venir)"],
    sortOrder: 43,
  },
  {
    slug: "institut_beaute",
    parentSlug: "sante_bien_etre",
    name: "Institut de beauté / Spa",
    description: "Soins esthétiques, massages bien-être, épilation, manucure.",
    modules: SERVICE_MODULES,
    defaultCategories: {
      checklist: ["Cabines de soin", "Stérilisation matériel", "Stocks produits", "Caisse"],
    },
    vocabulary: { customer: "client", item: "soin" },
    taxRules: VAT_FR_SERVICES,
    icon: "Sparkles",
    tagline: "Soins esthétiques, massages, épilation, manucure",
    idealFor: "Instituts de beauté, spas urbains, centres bien-être indépendants.",
    coverGradient: GRADIENT_HEALTH,
    featuresHighlight: [
      "Checklist Cabines + Stérilisation + Stocks",
      "Vocabulaire « soin » (≠ consultation médicale)",
      "TVA 20% standard prestations esthétiques",
      "Suivi des esthéticiennes",
    ],
    notIncluded: ["Réservation en ligne (à venir)"],
    sortOrder: 44,
  },
];
