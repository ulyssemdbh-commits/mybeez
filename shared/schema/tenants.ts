import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  clientCode: text("client_code").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  businessType: text("business_type").notNull().default("restaurant"),
  pinCode: text("pin_code").notNull(),
  adminCode: text("admin_code").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  timezone: text("timezone").notNull().default("Europe/Paris"),
  isActive: boolean("is_active").notNull().default(true),
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
