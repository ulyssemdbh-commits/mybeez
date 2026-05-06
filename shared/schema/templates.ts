/**
 * Business Templates — myBeez
 *
 * Vertical-agnostic catalog of business archetypes. At signup, a tenant
 * picks a template, and the app seeds itself with the modules,
 * categories, vocabulary and tax rules adapted to that vertical.
 *
 * Two-level taxonomy via self-FK (parentId nullable):
 *   commerce_de_bouche       (top)
 *     ├── restaurant         (sub)
 *     ├── cafe               (sub)
 *     └── ...
 *   entreprise_services      (top)
 *     ├── coiffure           (sub)
 *     └── ...
 *
 * The schema itself stays vocabulary-neutral. Vertical specificity
 * lives in JSONB columns (`modules`, `defaultCategories`, `vocabulary`,
 * `taxRules`) so adding a new vertical = inserting a row, not a code
 * change.
 */

import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const businessTemplates = pgTable(
  "business_templates",
  {
    id: serial("id").primaryKey(),
    parentId: integer("parent_id").references((): AnyPgColumn => businessTemplates.id, {
      onDelete: "restrict",
    }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Module slugs enabled by default for this template.
     * e.g. ["checklist", "suppliers", "payroll"]
     * The set of valid module slugs is owned by the application
     * (not a DB enum), so adding a module doesn't require a migration.
     */
    modules: jsonb("modules").$type<string[]>().notNull().default([]),
    /**
     * Seed data for tenant creation. Shape is module-specific.
     * e.g. { checklist: { categories: ["Produits frais", "Réserve"] } }
     */
    defaultCategories: jsonb("default_categories")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /**
     * UI label overrides. Plain key→string mapping consumed by the
     * frontend (e.g. { item: "produit", checklist: "préparation" }).
     */
    vocabulary: jsonb("vocabulary").$type<Record<string, string>>().notNull().default({}),
    /**
     * Tax / VAT defaults attached to the template.
     *
     * Stored as a flat key→number map so the shape can vary per locale
     * without requiring a migration. The application layer interprets
     * keys with the contract below — adding a new key = updating the
     * UI label table in `client/src/lib/taxRulesLabels.ts`.
     *
     * Standard French keys (used by the seed):
     *   - `defaultVat` : taux normalement appliqué sur la facturation
     *     courante (ex. 20% services, 10% restauration sur place).
     *   - `reducedVat` : taux réduit pour certaines lignes (ex. 5,5% à
     *     emporter, 10% sur services à la personne agréés).
     *   - `alcohol` : taux spécifique alcool en restauration (toujours
     *     20% en France).
     *   - `exempt` : 1 si le métier est exonéré de TVA (ex. professions
     *     médicales libérales, art. 261-4-1° CGI), 0 sinon. La valeur
     *     est numérique pour rester dans le contrat
     *     `Record<string, number>`.
     *
     * Toute autre clé est tolérée mais ignorée par l'UI tant qu'un
     * label n'est pas ajouté.
     */
    taxRules: jsonb("tax_rules")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    /**
     * Lucide icon name (eg. "Utensils", "Scissors"). Used by the picker.
     * Nullable during migration window — sub-templates require one going
     * forward (validated at the seed level).
     */
    icon: text("icon"),
    /**
     * Short marketing line (≤80 chars) shown under the template name.
     * Example: "Production fraîche, vente sur place et à emporter".
     */
    tagline: text("tagline"),
    /**
     * Audience hint (≤200 chars) shown in the picker card.
     * Example: "TPE 1-10 personnes, vente comptoir + emporter".
     */
    idealFor: text("ideal_for"),
    /**
     * Tailwind gradient classes for the picker card cover, eg.
     * "from-amber-500 to-orange-500". Lets the catalog drive UX without
     * hardcoding brand decisions in the components.
     */
    coverGradient: text("cover_gradient"),
    /**
     * 3-5 selling points shown as bullets in the picker card. Concrete:
     * "Checklist Cuisine + Salle préseedée", "TVA 10% par défaut", etc.
     */
    featuresHighlight: jsonb("features_highlight")
      .$type<string[]>()
      .notNull()
      .default([]),
    /**
     * Honest "not included" list. Sets expectations and avoids the
     * surprise factor on signup. Eg. "Pas de gestion stock détaillée".
     */
    notIncluded: jsonb("not_included")
      .$type<string[]>()
      .notNull()
      .default([]),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    parentIdx: index("business_templates_parent_id_idx").on(table.parentId),
    slugIdx: index("business_templates_slug_idx").on(table.slug),
  }),
);

export const insertBusinessTemplateSchema = createInsertSchema(businessTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BusinessTemplate = typeof businessTemplates.$inferSelect;
export type InsertBusinessTemplate = z.infer<typeof insertBusinessTemplateSchema>;
