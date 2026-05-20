/**
 * CashMy merchants — compte commerçant cashback d'un tenant mybeez.
 *
 * Relation 1:1 logique avec `tenants` : un tenant qui active le
 * module CashMy (`tenants.modules_enabled` contient `"cashmy"`) crée
 * un `cashmy_merchants` correspondant. Les informations métier
 * (`name`, `address`, `siret`, IBAN) proviennent normalement du
 * tenant lui-même mais sont **dupliquées ici** pour garder
 * l'autonomie du module CashMy (un futur changement de "name" tenant
 * ne casse pas le cashmy_merchant existant).
 *
 * Tarification :
 * - `cashbackRate` : pourcentage rendu au client (default 10%).
 * - Fee plateforme 3% + TVA 20% calculés côté `merchant_billings`.
 */
import { pgTable, text, serial, integer, boolean, timestamp, decimal, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cashmyMerchants = pgTable(
  "cashmy_merchants",
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
     * Convention CashMy : 10% par défaut. Peut être modifié par le
     * merchant (avec validation côté backend ; min 1%, max 30%).
     */
    cashbackRate: decimal("cashback_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
    isActive: boolean("is_active").notNull().default(true),
    phone: text("phone"),
    email: text("email"),
    siret: text("siret"),
    contactName: text("contact_name"),
    /** IBAN pour versement du cashback collecté côté CashMy. */
    bankIban: text("bank_iban"),
    bankBic: text("bank_bic"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // 1 seul merchant CashMy par tenant (relation 1:1 logique).
    uniqueIndex("cashmy_merchants_tenant_idx").on(table.tenantId),
  ],
);

export const insertCashMyMerchantSchema = createInsertSchema(cashmyMerchants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCashMyMerchant = z.infer<typeof insertCashMyMerchantSchema>;
export type CashMyMerchant = typeof cashmyMerchants.$inferSelect;
