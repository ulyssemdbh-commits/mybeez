/**
 * Tenant Domains — myBeez
 *
 * Stores **custom** domains attached to a tenant (e.g. `app.salondemarie.fr`).
 *
 * The canonical subdomain (`<slug>.<rootDomain>`) is NOT stored here —
 * it is resolved by parsing the request host directly. This table only
 * holds vanity / customer-owned hostnames.
 *
 * `verifiedAt` is null until the customer has proven control of the
 * hostname (DNS TXT challenge or equivalent — out of scope for PR #7).
 * Until verified, the domain MUST NOT resolve to the tenant.
 */

import { pgTable, text, serial, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

export const tenantDomains = pgTable(
  "tenant_domains",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at"),
    sslStatus: text("ssl_status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    hostnameIdx: index("tenant_domains_hostname_idx").on(table.hostname),
    tenantIdx: index("tenant_domains_tenant_id_idx").on(table.tenantId),
  }),
);

export const insertTenantDomainSchema = createInsertSchema(tenantDomains).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TenantDomain = typeof tenantDomains.$inferSelect;
export type InsertTenantDomain = z.infer<typeof insertTenantDomainSchema>;
