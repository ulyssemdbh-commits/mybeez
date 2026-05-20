/**
 * REV merchants — compte commerçant cashback d'un tenant mybeez.
 *
 * Relation 1:1 logique avec `tenants` : un tenant qui active le
 * module REV (`tenants.modules_enabled` contient `"rev"`) crée un
 * `rev_merchants` correspondant. Les informations métier
 * (`name`, `address`, `siret`, IBAN) proviennent normalement du
 * tenant lui-même mais sont **dupliquées ici** pour garder
 * l'autonomie du module REV (un futur changement de "name" tenant
 * ne casse pas le rev_merchant existant).
 *
 * Tarification :
 * - `cashbackRate` : pourcentage rendu au client (default 10%).
 * - REV fee 3% + TVA 20% calculés côté `merchant_billings`.
 */
import { pgTable, text, serial, integer, boolean, timestamp, decimal, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const revMerchants = pgTable(
  "rev_merchants",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    /** Nom commercial affiché aux consommateurs. */
    name: text("name").notNull(),
    description: text("description"),
    /** Catégorie informative (ex. "boulangerie", "salon", "boutique"). */
    category: text("category").notNull(),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    imageUrl: text("image_url"),
    /**
     * Pourcentage de cashback offert au client à chaque transaction.
     * Convention REV : 10% par défaut. Peut être modifié par le
     * merchant (avec validation côté backend ; min 1%, max 30%).
     */
    cashbackRate: decimal("cashback_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
    isActive: boolean("is_active").notNull().default(true),
    phone: text("phone"),
    email: text("email"),
    siret: text("siret"),
    contactName: text("contact_name"),
    /** IBAN pour versement du cashback collecté côté REV. */
    bankIban: text("bank_iban"),
    bankBic: text("bank_bic"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // 1 seul merchant REV par tenant (relation 1:1 logique).
    uniqueIndex("rev_merchants_tenant_idx").on(table.tenantId),
  ],
);

export const insertRevMerchantSchema = createInsertSchema(revMerchants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRevMerchant = z.infer<typeof insertRevMerchantSchema>;
export type RevMerchant = typeof revMerchants.$inferSelect;
