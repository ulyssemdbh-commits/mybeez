/**
 * Business Template Service — myBeez
 *
 * Read-only access to `business_templates`. Cached in-memory because
 * the catalog is small (< 50 rows) and changes only via deploy
 * (`npm run seed:templates`).
 *
 * Cache invalidation: process restart (sufficient until we wire a
 * proper admin UI). `clearCache()` is exposed for tests.
 */

import { db } from "../db";
import { businessTemplates, type BusinessTemplate } from "../../shared/schema/templates";
import { eq } from "drizzle-orm";

interface TemplatesIndex {
  bySlug: Map<string, BusinessTemplate>;
  byId: Map<number, BusinessTemplate>;
  topLevel: BusinessTemplate[];
  childrenOf: Map<number, BusinessTemplate[]>;
}

class TemplateService {
  private cache: TemplatesIndex | null = null;

  private async load(): Promise<TemplatesIndex> {
    const rows = await db
      .select()
      .from(businessTemplates)
      .where(eq(businessTemplates.isActive, true));

    const bySlug = new Map<string, BusinessTemplate>();
    const byId = new Map<number, BusinessTemplate>();
    const childrenOf = new Map<number, BusinessTemplate[]>();
    const topLevel: BusinessTemplate[] = [];

    for (const r of rows) {
      bySlug.set(r.slug, r);
      byId.set(r.id, r);
    }
    for (const r of rows) {
      if (r.parentId === null) {
        topLevel.push(r);
      } else {
        const arr = childrenOf.get(r.parentId) ?? [];
        arr.push(r);
        childrenOf.set(r.parentId, arr);
      }
    }

    const sortByOrder = (a: BusinessTemplate, b: BusinessTemplate) =>
      a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug);
    topLevel.sort(sortByOrder);
    for (const arr of childrenOf.values()) arr.sort(sortByOrder);

    return { bySlug, byId, topLevel, childrenOf };
  }

  private async getIndex(): Promise<TemplatesIndex> {
    if (!this.cache) this.cache = await this.load();
    return this.cache;
  }

  async listTopLevel(): Promise<BusinessTemplate[]> {
    return (await this.getIndex()).topLevel;
  }

  async listChildren(parentId: number): Promise<BusinessTemplate[]> {
    return (await this.getIndex()).childrenOf.get(parentId) ?? [];
  }

  async getBySlug(slug: string): Promise<BusinessTemplate | null> {
    return (await this.getIndex()).bySlug.get(slug) ?? null;
  }

  async getById(id: number): Promise<BusinessTemplate | null> {
    return (await this.getIndex()).byId.get(id) ?? null;
  }

  /**
   * Returns the full tree shape used by the public API and the
   * onboarding picker:
   *   [{ ...top, children: [...sub] }, ...]
   */
  async listTree(): Promise<Array<BusinessTemplate & { children: BusinessTemplate[] }>> {
    const idx = await this.getIndex();
    return idx.topLevel.map((top) => ({
      ...top,
      children: idx.childrenOf.get(top.id) ?? [],
    }));
  }

  clearCache(): void {
    this.cache = null;
  }
}

export const templateService = new TemplateService();
