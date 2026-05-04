/**
 * Suppliers Routes — back-office gestion (Management).
 *
 * Tenant-scoped CRUD on the `suppliers` table.
 * Mounted at `/api/management/:slug/suppliers`.
 *
 * Auth model :
 *   - READ : any nominative member of the tenant (owner, admin, manager,
 *     staff, viewer).
 *   - WRITE (POST/PATCH/DELETE) : owner, admin or manager only.
 *
 * Soft delete : DELETE flips `isActive` to false. The row stays in the
 * database so historical purchases remain consistent.
 */

import type { Express, Request, Response } from "express";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { suppliers } from "../../../shared/schema/checklist";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";

function parseId(param: string): number | null {
  const id = Number.parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const SUPPLIER_CATEGORIES = ["autre", "matieres_premieres", "boissons", "fournitures", "services", "logistique"] as const;

const trimmedString = (max: number, opts?: { lower?: boolean }) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (opts?.lower ? v.toLowerCase() : v))
    .optional()
    .or(z.literal("").transform(() => undefined));

const supplierBaseFields = {
  name: z.string().trim().min(1).max(200),
  shortName: trimmedString(60),
  siret: trimmedString(20),
  tvaNumber: trimmedString(40),
  accountNumber: trimmedString(40),
  address: trimmedString(200),
  city: trimmedString(100),
  postalCode: trimmedString(20),
  phone: trimmedString(40),
  email: z.union([z.literal(""), z.string().email().max(200)]).optional().transform((v) => (v ? v : undefined)),
  website: z.union([z.literal(""), z.string().url().max(200)]).optional().transform((v) => (v ? v : undefined)),
  contactName: trimmedString(120),
  category: z.enum(SUPPLIER_CATEGORIES).optional(),
  paymentTerms: trimmedString(100),
  defaultPaymentMethod: trimmedString(40),
  bankIban: trimmedString(40),
  notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
};

const createSupplierSchema = z.object(supplierBaseFields);
const updateSupplierSchema = z
  .object({
    ...supplierBaseFields,
    name: z.string().trim().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Aucun champ à mettre à jour" });

export function registerManagementSupplierRoutes(app: Express): void {
  const r = "/api/management/:slug/suppliers";

  app.get(r, resolveTenant, requireUser, requireRole("owner", "admin", "manager", "staff", "viewer"), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const includeInactive = req.query.includeInactive === "true";
      const conditions = [eq(suppliers.tenantId, tid)];
      if (!includeInactive) conditions.push(eq(suppliers.isActive, true));

      const rows = await db
        .select()
        .from(suppliers)
        .where(and(...conditions))
        .orderBy(asc(suppliers.name));

      res.json({ suppliers: rows });
    } catch (error) {
      console.error("[Suppliers] List error:", error);
      res.status(500).json({ error: "Erreur de chargement" });
    }
  });

  app.get(`${r}/:id`, resolveTenant, requireUser, requireRole("owner", "admin", "manager", "staff", "viewer"), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tid)));

      if (!row) return res.status(404).json({ error: "Fournisseur introuvable" });
      res.json({ supplier: row });
    } catch (error) {
      console.error("[Suppliers] Get error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.post(r, resolveTenant, requireUser, requireRole("owner", "admin", "manager"), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const data = createSupplierSchema.parse(req.body);

      const [row] = await db
        .insert(suppliers)
        .values({ ...data, tenantId: tid })
        .returning();

      res.status(201).json({ supplier: row });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[Suppliers] Create error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.patch(`${r}/:id`, resolveTenant, requireUser, requireRole("owner", "admin", "manager"), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const data = updateSupplierSchema.parse(req.body);

      const [row] = await db
        .update(suppliers)
        .set(data)
        .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tid)))
        .returning();

      if (!row) return res.status(404).json({ error: "Fournisseur introuvable" });
      res.json({ supplier: row });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[Suppliers] Update error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.delete(`${r}/:id`, resolveTenant, requireUser, requireRole("owner", "admin", "manager"), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .update(suppliers)
        .set({ isActive: false })
        .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tid)))
        .returning();

      if (!row) return res.status(404).json({ error: "Fournisseur introuvable" });
      res.json({ success: true });
    } catch (error) {
      console.error("[Suppliers] Delete error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });
}
