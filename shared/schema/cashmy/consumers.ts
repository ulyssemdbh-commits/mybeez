/**
 * CashMy consumers — clients finaux cashback.
 *
 * Cette table est **globale** (pas de `tenant_id`), volontairement :
 * un consommateur peut accumuler du cashback chez plusieurs merchants
 * (donc plusieurs tenants) avec un seul compte. Le scoping multi-tenant
 * se fait sur les tables relationnelles (`cashmy_cashback_balances`, etc.)
 * via leur `tenant_id` et leur FK vers `cashmy_merchants`.
 *
 * À distinguer strictement des `users` mybeez Pro (Owner/Admin/Manager
 * d'un tenant) — un user mybeez Pro n'est pas un `cashmy_consumer` et
 * vice-versa. L'auth est séparée (cf. ADR 2026-05-20 §2 point 5).
 */
import { pgTable, text, serial, timestamp, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cashmyConsumers = pgTable(
  "cashmy_consumers",
  {
    id: serial("id").primaryKey(),
    /**
     * Identifiant public lisible humain, format `CashMy-XXXXXXXX` (8 chars
     * alphanumériques majuscules + chiffres). Sert d'identifiant de
     * transfert public entre consommateurs (cashback / gift cards).
     * 8 chars = 36^8 ≈ 2.82e12 combinaisons → safe pour le volume
     * cible (millions de comptes). Index UNIQUE + retry sur collision
     * côté `services/cashmy/consumerService.ts` (à venir Sprint 2).
     */
    publicId: varchar("public_id", { length: 16 }).notNull(),
    email: text("email").notNull(),
    /** argon2id hash via `services/auth/passwordService.ts` (mybeez). */
    passwordHash: text("password_hash").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    dateOfBirth: timestamp("date_of_birth"),
    profileImageUrl: text("profile_image_url"),
    /**
     * Statut du compte. `pending` = email pas encore vérifié,
     * `active` = OK, `disabled` = désactivé manuellement,
     * `banned` = sanction admin.
     */
    status: text("status").notNull().default("pending"),
    emailVerifiedAt: timestamp("email_verified_at"),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cashmy_consumers_email_idx").on(table.email),
    uniqueIndex("cashmy_consumers_public_id_idx").on(table.publicId),
  ],
);

export const insertCashMyConsumerSchema = createInsertSchema(cashmyConsumers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  emailVerifiedAt: true,
});

export type InsertCashMyConsumer = z.infer<typeof insertCashMyConsumerSchema>;
export type CashMyConsumer = typeof cashmyConsumers.$inferSelect;
