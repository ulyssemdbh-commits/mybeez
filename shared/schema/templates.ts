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
     * Tax / VAT defaults. Flexible shape per locale.
     * e.g. { defaultVat: 20, reducedVat: 10, food: 5.5 }
     */
    taxRules: jsonb("tax_rules")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
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
