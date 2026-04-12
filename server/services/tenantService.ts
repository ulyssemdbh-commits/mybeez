/**
 * Tenant Service — myBeez
 *
 * Manages tenant lifecycle: creation, lookup, client code generation.
 * Each tenant gets a unique 8-digit client code at creation.
 */

import { db } from "../db";
import { tenants, type Tenant, type InsertTenant } from "../../shared/schema/tenants";
import { eq } from "drizzle-orm";

class TenantService {
  private cache: Map<string, Tenant> = new Map();

  private generateClientCode(): string {
    const min = 10000000;
    const max = 99999999;
    return String(Math.floor(Math.random() * (max - min + 1)) + min);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 30);
  }

  async create(data: InsertTenant): Promise<Tenant> {
    let clientCode = this.generateClientCode();

    let exists = await db.select().from(tenants).where(eq(tenants.clientCode, clientCode));
    let attempts = 0;
    while (exists.length > 0 && attempts < 10) {
      clientCode = this.generateClientCode();
      exists = await db.select().from(tenants).where(eq(tenants.clientCode, clientCode));
      attempts++;
    }

    const slug = data.slug || this.slugify(data.name);

    const [tenant] = await db.insert(tenants).values({
      ...data,
      clientCode,
      slug,
    }).returning();

    this.cache.set(slug, tenant);
    this.cache.set(clientCode, tenant);
    console.log(`[Tenant] Created: ${tenant.name} (${clientCode}) → /${slug}`);
    return tenant;
  }

  async getBySlug(slug: string): Promise<Tenant | null> {
    if (this.cache.has(slug)) return this.cache.get(slug)!;

    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    if (tenant) {
      this.cache.set(slug, tenant);
      this.cache.set(tenant.clientCode, tenant);
    }
    return tenant || null;
  }

  async getByClientCode(code: string): Promise<Tenant | null> {
    if (this.cache.has(code)) return this.cache.get(code)!;

    const [tenant] = await db.select().from(tenants).where(eq(tenants.clientCode, code));
    if (tenant) {
      this.cache.set(tenant.slug, tenant);
      this.cache.set(code, tenant);
    }
    return tenant || null;
  }

  async getById(id: number): Promise<Tenant | null> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant || null;
  }

  async listAll(): Promise<Tenant[]> {
    return db.select().from(tenants).where(eq(tenants.isActive, true));
  }

  async update(id: number, data: Partial<InsertTenant>): Promise<Tenant | null> {
    const [tenant] = await db.update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();

    if (tenant) {
      this.cache.set(tenant.slug, tenant);
      this.cache.set(tenant.clientCode, tenant);
    }
    return tenant || null;
  }

  async loginWithPin(pin: string, slug?: string): Promise<{ success: boolean; tenant?: Tenant; role?: string; error?: string }> {
    const allTenants = slug
      ? [await this.getBySlug(slug)].filter(Boolean) as Tenant[]
      : await this.listAll();

    for (const tenant of allTenants) {
      if (pin === tenant.pinCode) {
        return { success: true, tenant, role: "staff" };
      }
      if (pin === tenant.adminCode) {
        return { success: true, tenant, role: "admin" };
      }
    }

    return { success: false, error: "Code incorrect" };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const tenantService = new TenantService();
