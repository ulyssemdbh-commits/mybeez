/**
 * Checklist Routes — myBeez (Multi-Tenant)
 *
 * All routes are scoped to a tenant via /:slug prefix.
 * Example: /api/checklist/valentine/categories
 *
 * The resolveTenant middleware attaches req.tenant and req.tenantId.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { resolveTenant } from "../middleware/tenant";
import { db } from "../db";
import { categories, items, checks, futureItems, emailLogs, comments } from "../../shared/schema/checklist";
import { eq, and, desc, gte } from "drizzle-orm";
import { emitSuguChecklistUpdated } from "../services/realtimeSync";
import { z } from "zod";

function parseId(param: string): number | null {
  const id = parseInt(param, 10);
  return isNaN(id) ? null : id;
}

function getTodayDate(): string {
  const now = new Date();
  const paris = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  if (paris.getHours() < 2) paris.setDate(paris.getDate() - 1);
  return paris.toISOString().split("T")[0];
}

async function requireTenantAuth(req: Request, res: Response, next: NextFunction) {
  const session = req.session as any;
  if (!session?.authenticated) {
    return res.status(401).json({ error: "Authentification requise" });
  }
  if (req.tenantId && session.tenantId !== req.tenantId && session.role !== "superadmin") {
    return res.status(403).json({ error: "Accès interdit à ce restaurant" });
  }
  next();
}

const toggleSchema = z.object({ itemId: z.number(), isChecked: z.boolean() });
const updateItemSchema = z.object({
  name: z.string().optional(),
  nameVi: z.string().nullable().optional(),
  nameTh: z.string().nullable().optional(),
  categoryId: z.number().optional(),
});
const createItemSchema = z.object({ name: z.string().min(1), categoryId: z.number() });
const createCategorySchema = z.object({ name: z.string().min(1), sheet: z.enum(["Feuil1", "Feuil2"]).optional() });
const addCommentSchema = z.object({ author: z.string().min(1).max(50), message: z.string().min(1).max(500) });

export function registerChecklistRoutes(app: Express): void {
  const r = "/api/checklist/:slug";

  app.get(`${r}/categories`, resolveTenant, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const cats = await db.select().from(categories).where(eq(categories.tenantId, tid));
      const itms = await db.select().from(items).where(and(eq(items.tenantId, tid), eq(items.isActive, true)));
      const today = getTodayDate();
      const todayChecks = await db.select().from(checks).where(and(eq(checks.tenantId, tid), eq(checks.checkDate, today)));

      const checkedIds = new Set(todayChecks.filter((c) => c.isChecked).map((c) => c.itemId));

      const enriched = cats
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cat) => ({
          ...cat,
          items: itms
            .filter((i) => i.categoryId === cat.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((i) => ({ ...i, isChecked: checkedIds.has(i.id) })),
        }));

      res.json(enriched);
    } catch (error) {
      console.error("[Checklist] Get categories error:", error);
      res.status(500).json({ error: "Erreur de chargement" });
    }
  });

  app.get(`${r}/dashboard`, resolveTenant, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const today = getTodayDate();
      const allItems = await db.select().from(items).where(and(eq(items.tenantId, tid), eq(items.isActive, true)));
      const todayChecks = await db.select().from(checks).where(and(eq(checks.tenantId, tid), eq(checks.checkDate, today)));
      const checkedIds = new Set(todayChecks.filter((c) => c.isChecked).map((c) => c.itemId));

      const total = allItems.length;
      const checked = allItems.filter((i) => checkedIds.has(i.id)).length;
      const uncheckedItems = allItems.filter((i) => !checkedIds.has(i.id)).map((i) => i.name);

      res.json({ total, checked, unchecked: total - checked, uncheckedItems, date: today });
    } catch (error) {
      console.error("[Checklist] Dashboard error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.post(`${r}/toggle`, resolveTenant, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const data = toggleSchema.parse(req.body);
      const today = getTodayDate();

      const existing = await db.select().from(checks)
        .where(and(eq(checks.tenantId, tid), eq(checks.itemId, data.itemId), eq(checks.checkDate, today)));

      if (existing.length > 0) {
        await db.update(checks)
          .set({ isChecked: data.isChecked, checkedAt: data.isChecked ? new Date() : null })
          .where(eq(checks.id, existing[0].id));
      } else {
        await db.insert(checks).values({
          tenantId: tid,
          itemId: data.itemId,
          checkDate: today,
          isChecked: data.isChecked,
          checkedAt: data.isChecked ? new Date() : null,
        });
      }

      res.json({ success: true });
      emitSuguChecklistUpdated(req.tenant!.slug);
    } catch (error) {
      console.error("[Checklist] Toggle error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.post(`${r}/reset`, resolveTenant, requireTenantAuth, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const today = getTodayDate();
      await db.update(checks)
        .set({ isChecked: false, checkedAt: null })
        .where(and(eq(checks.tenantId, tid), eq(checks.checkDate, today)));
      res.json({ success: true });
      emitSuguChecklistUpdated(req.tenant!.slug);
    } catch (error) {
      console.error("[Checklist] Reset error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.post(`${r}/items`, resolveTenant, requireTenantAuth, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const data = createItemSchema.parse(req.body);
      const maxOrder = await db.select().from(items)
        .where(and(eq(items.tenantId, tid), eq(items.categoryId, data.categoryId)));
      const sortOrder = maxOrder.length > 0 ? Math.max(...maxOrder.map((i) => i.sortOrder)) + 1 : 0;

      const [item] = await db.insert(items).values({
        tenantId: tid,
        name: data.name,
        categoryId: data.categoryId,
        sortOrder,
      }).returning();

      res.status(201).json(item);
    } catch (error) {
      console.error("[Checklist] Create item error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.patch(`${r}/items/:id`, resolveTenant, requireTenantAuth, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const itemId = parseId(req.params.id);
      if (!itemId) return res.status(400).json({ error: "ID invalide" });
      const data = updateItemSchema.parse(req.body);

      const [updated] = await db.update(items)
        .set(data)
        .where(and(eq(items.id, itemId), eq(items.tenantId, tid)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Item non trouvé" });
      res.json(updated);
    } catch (error) {
      console.error("[Checklist] Update item error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.delete(`${r}/items/:id`, resolveTenant, requireTenantAuth, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const itemId = parseId(req.params.id);
      if (!itemId) return res.status(400).json({ error: "ID invalide" });

      await db.update(items)
        .set({ isActive: false })
        .where(and(eq(items.id, itemId), eq(items.tenantId, tid)));

      res.json({ success: true });
    } catch (error) {
      console.error("[Checklist] Delete item error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.post(`${r}/categories`, resolveTenant, requireTenantAuth, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const data = createCategorySchema.parse(req.body);

      const [cat] = await db.insert(categories).values({
        tenantId: tid,
        name: data.name,
        sheet: data.sheet || "Feuil1",
        sortOrder: 0,
      }).returning();

      res.status(201).json(cat);
    } catch (error) {
      console.error("[Checklist] Create category error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.get(`${r}/comments`, resolveTenant, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const result = await db.select().from(comments)
        .where(eq(comments.tenantId, tid))
        .orderBy(desc(comments.createdAt))
        .limit(50);
      res.json(result);
    } catch (error) {
      console.error("[Checklist] Get comments error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.post(`${r}/comments`, resolveTenant, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const data = addCommentSchema.parse(req.body);
      const [comment] = await db.insert(comments).values({
        tenantId: tid,
        author: data.author,
        message: data.message,
      }).returning();
      res.status(201).json(comment);
    } catch (error) {
      console.error("[Checklist] Add comment error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.get(`${r}/history`, resolveTenant, async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const month = req.query.month as string | undefined;
      const allItems = await db.select().from(items).where(and(eq(items.tenantId, tid), eq(items.isActive, true)));
      const cats = await db.select().from(categories).where(eq(categories.tenantId, tid));

      let checksQuery = db.select().from(checks).where(eq(checks.tenantId, tid));
      if (month) {
        checksQuery = checksQuery.where(gte(checks.checkDate, `${month}-01`)) as any;
      }
      const allChecks = await checksQuery;

      const byDate: Record<string, { total: number; checked: number; date: string }> = {};
      const dates = [...new Set(allChecks.map((c) => c.checkDate))];
      for (const date of dates) {
        const dayChecks = allChecks.filter((c) => c.checkDate === date && c.isChecked);
        byDate[date] = { date, total: allItems.length, checked: dayChecks.length };
      }

      res.json(Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
      console.error("[Checklist] History error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });
}
