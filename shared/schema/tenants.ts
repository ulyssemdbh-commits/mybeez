import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { businessTemplates } from "./templates";

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  clientCode: text("client_code").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  /**
   * Vertical archetype this tenant follows. Nullable during the
   * migration window — once all tenants have been backfilled, this
   * becomes NOT NULL and `businessType` is dropped.
   */
  templateId: integer("template_id").references(() => businessTemplates.id, {
    onDelete: "restrict",
  }),
  /**
   * @deprecated kept during the migration window. Use `templateId`.
   */
  businessType: text("business_type").notNull().default("restaurant"),
  /**
   * UI label overrides — typically copied from the template at signup,
   * then editable by the tenant. Empty `{}` means "use template
   * vocabulary unchanged".
   */
  vocabulary: jsonb("vocabulary").$type<Record<string, string>>().notNull().default({}),
  /**
   * Modules enabled for this tenant (slugs). Initially copied from
   * template.modules at signup. Allows enabling extras or disabling
   * defaults per tenant.
   */
  modulesEnabled: jsonb("modules_enabled").$type<string[]>().notNull().default([]),
  pinCode: text("pin_code").notNull(),
  adminCode: text("admin_code").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  timezone: text("timezone").notNull().default("Europe/Paris"),
  isActive: boolean("is_active").notNull().default(true),
  /**
   * @deprecated superseded by `modulesEnabled` (slugs list). Kept for
   * read-compat during the migration window.
   */
  features: jsonb("features").notNull().default({
    checklist: true,
    zones: false,
    comments: true,
    translate: false,
    discord: false,
    calendar: false,
    alfred: true,
  }),
  theme: jsonb("theme").notNull().default({
    primary: "amber",
    colorScheme: "green",
  }),
  config: jsonb("config").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  clientCode: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;
