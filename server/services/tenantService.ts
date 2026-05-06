/**
 * Tenant Service — myBeez
 *
 * Manages tenant lifecycle: creation, lookup, client code generation.
 * Each tenant gets a unique 8-digit client code at creation.
 *
 * Template hydration (PR #10a):
 *   - If `data.templateId` is set, the corresponding business template
 *     is loaded and its `modules` / `vocabulary` populate the tenant
 *     defaults UNLESS the caller passed explicit values.
 *   - Caller-provided values always win — the template only fills the
 *     gaps. This lets the admin override at creation time.
 */

import { db } from "../db";
import { tenants, type Tenant, type InsertTenant } from "../../shared/schema/tenants";
import { eq } from "drizzle-orm";
import { templateService } from "./templateService";

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
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 30);
  }

  /**
   * Hydrates tenant defaults from a template. Returns the partial
   * "patch" to merge — caller-supplied values take precedence.
   *
   * Pure-ish function (only DB read via templateService cache); broken
   * out so the create() pipeline stays linear.
   */
  private async hydrateFromTemplate(
    templateId: number | null | undefined,
    data: InsertTenant,
  ): Promise<{ vocabulary?: Record<string, string>; modulesEnabled?: string[] }> {
    if (!templateId) return {};
    const tpl = await templateService.getById(templateId);
    if (!tpl) {
      throw new Error(`tenantService.create: unknown templateId=${templateId}`);
    }
    const patch: { vocabulary?: Record<string, string>; modulesEnabled?: string[] } = {};
    if (data.vocabulary === undefined) patch.vocabulary = tpl.vocabulary;
    if (data.modulesEnabled === undefined) patch.modulesEnabled = tpl.modules;
    return patch;
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
    const templatePatch = await this.hydrateFromTemplate(data.templateId, data);

    const [tenant] = await db
      .insert(tenants)
      .values({
        ...data,
        ...templatePatch,
        clientCode,
        slug,
      })
      .returning();

    this.cache.set(slug, tenant);
    this.cache.set(clientCode, tenant);
    console.log(
      `[Tenant] Created: ${tenant.name} (${clientCode}) → /${slug}` +
        (tenant.templateId ? ` [templateId=${tenant.templateId}]` : ""),
    );
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
    const [tenant] = await db
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();

    if (tenant) {
      this.cache.set(tenant.slug, tenant);
      this.cache.set(tenant.clientCode, tenant);
    }
    return tenant || null;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const tenantService = new TenantService();
