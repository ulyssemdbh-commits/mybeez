/**
 * Purchases Routes — back-office gestion (Management).
 *
 * CRUD + stats sur la table `purchases`. Mounted at
 * `/api/management/:slug/purchases`.
 *
 * Auth model :
 *   - READ : tous les rôles tenant (visibilité complète)
 *   - WRITE (POST/PATCH/DELETE) : owner / admin / manager
 *
 * Soft delete : DELETE flippe `isActive` à false. La ligne reste en DB
 * (compta + audit). Un PATCH `isActive: true` la réactive.
 *
 * Filtres GET :
 *   - ?from=YYYY-MM-DD&to=YYYY-MM-DD  bornes invoiceDate (incluses)
 *   - ?supplierId=N                    filtre fournisseur
 *   - ?status=pending|paid|late|cancelled
 *   - ?includeInactive=true            inclut les lignes archivées
 *
 * Tri : invoiceDate desc par défaut (les plus récentes en haut).
 *
 * Si `supplierId` fourni à un POST/PATCH, le serveur enrichit
 * `supplierName` automatiquement depuis la table suppliers — la trace
 * texte reste lisible même si le fournisseur est archivé/renommé plus
 * tard. Adapté du pattern ulysseclaude `financialRoutes.ts:22-103`.
 */

import type { Express, Request, Response } from "express";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { purchases, suppliers } from "../../../shared/schema/checklist";
import { and, eq, gte, lte, asc, desc, sum, count } from "drizzle-orm";
import { z } from "zod";
import {
  parseInvoiceImage,
  validateBase64Image,
  matchSupplierByName,
  SUPPORTED_MIME_TYPES,
  type SupportedMime,
} from "../../services/parsing/invoiceParser";

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin", "manager"] as const;

const PAYMENT_STATUSES = ["pending", "paid", "late", "cancelled"] as const;

function parseId(param: string): number | null {
  const id = Number.parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu YYYY-MM-DD");

const trimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

const purchaseBaseFields = {
  supplierId: z.number().int().positive().nullable().optional(),
  supplierName: trimmedString(200),
  invoiceNumber: trimmedString(60),
  invoiceDate: ISO_DATE,
  totalHt: z.number().nonnegative().nullable().optional(),
  totalTtc: z.number().nonnegative(),
  tvaRate: z.number().min(0).max(100).nullable().optional(),
  tvaAmount: z.number().nonnegative().nullable().optional(),
  paymentMethod: trimmedString(40),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  paidDate: ISO_DATE.optional().or(z.literal("").transform(() => undefined)),
  dueDate: ISO_DATE.optional().or(z.literal("").transform(() => undefined)),
  category: trimmedString(60),
  description: trimmedString(500),
  notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
};

const createPurchaseSchema = z.object(purchaseBaseFields);

const updatePurchaseSchema = z
  .object({
    ...purchaseBaseFields,
    invoiceDate: ISO_DATE.optional(),
    totalTtc: z.number().nonnegative().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Aucun champ à mettre à jour" });

const listQuerySchema = z.object({
  from: ISO_DATE.optional(),
  to: ISO_DATE.optional(),
  supplierId: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
    .optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  includeInactive: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

/**
 * Cherche le nom du fournisseur si supplierId fourni mais supplierName absent.
 * Permet de garder une trace texte lisible si le fournisseur est archivé.
 */
async function resolveSupplierName(
  tenantId: number,
  supplierId: number | null | undefined,
): Promise<string | null> {
  if (!supplierId) return null;
  const [row] = await db
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.tenantId, tenantId)));
  return row?.name ?? null;
}

export function registerManagementPurchasesRoutes(app: Express): void {
  const r = "/api/management/:slug/purchases";

  // ============================== LIST ==============================
  app.get(
    r,
    resolveTenant,
    requireUser,
    requireRole(...READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const filters = listQuerySchema.parse(req.query);

        const conditions = [eq(purchases.tenantId, tid)];
        if (!filters.includeInactive) conditions.push(eq(purchases.isActive, true));
        if (filters.from) conditions.push(gte(purchases.invoiceDate, filters.from));
        if (filters.to) conditions.push(lte(purchases.invoiceDate, filters.to));
        if (filters.supplierId) conditions.push(eq(purchases.supplierId, filters.supplierId));
        if (filters.status) conditions.push(eq(purchases.paymentStatus, filters.status));

        const rows = await db
          .select()
          .from(purchases)
          .where(and(...conditions))
          .orderBy(desc(purchases.invoiceDate), desc(purchases.id));

        res.json({ purchases: rows });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Filtres invalides", details: error.errors });
        }
        console.error("[Purchases] List error:", error);
        res.status(500).json({ error: "Erreur de chargement" });
      }
    },
  );

  // ============================== STATS ==============================
  app.get(
    `${r}/stats`,
    resolveTenant,
    requireUser,
    requireRole(...READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const filters = listQuerySchema.parse(req.query);

        const baseConditions = [eq(purchases.tenantId, tid), eq(purchases.isActive, true)];
        if (filters.from) baseConditions.push(gte(purchases.invoiceDate, filters.from));
        if (filters.to) baseConditions.push(lte(purchases.invoiceDate, filters.to));

        const [totalRow] = await db
          .select({
            totalTtc: sum(purchases.totalTtc),
            totalHt: sum(purchases.totalHt),
            invoiceCount: count(purchases.id),
          })
          .from(purchases)
          .where(and(...baseConditions));

        const [unpaidRow] = await db
          .select({
            unpaidTotal: sum(purchases.totalTtc),
            unpaidCount: count(purchases.id),
          })
          .from(purchases)
          .where(and(...baseConditions, eq(purchases.paymentStatus, "pending")));

        res.json({
          totalTtc: Number(totalRow?.totalTtc ?? 0),
          totalHt: Number(totalRow?.totalHt ?? 0),
          invoiceCount: Number(totalRow?.invoiceCount ?? 0),
          unpaidTotal: Number(unpaidRow?.unpaidTotal ?? 0),
          unpaidCount: Number(unpaidRow?.unpaidCount ?? 0),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Filtres invalides", details: error.errors });
        }
        console.error("[Purchases] Stats error:", error);
        res.status(500).json({ error: "Erreur de statistiques" });
      }
    },
  );

  // ============================== GET ONE ==============================
  app.get(
    `${r}/:id`,
    resolveTenant,
    requireUser,
    requireRole(...READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: "ID invalide" });

        const [row] = await db
          .select()
          .from(purchases)
          .where(and(eq(purchases.id, id), eq(purchases.tenantId, tid)));

        if (!row) return res.status(404).json({ error: "Achat introuvable" });
        res.json({ purchase: row });
      } catch (error) {
        console.error("[Purchases] Get error:", error);
        res.status(500).json({ error: "Erreur" });
      }
    },
  );

  // ============================== CREATE ==============================
  app.post(
    r,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const data = createPurchaseSchema.parse(req.body);

        // Auto-fill supplierName depuis la table suppliers si supplierId fourni
        // sans nom (UX : le client envoie soit l'un soit l'autre).
        let supplierName = data.supplierName;
        if (data.supplierId && !supplierName) {
          supplierName = (await resolveSupplierName(tid, data.supplierId)) ?? undefined;
        }

        const [row] = await db
          .insert(purchases)
          .values({
            ...data,
            tenantId: tid,
            supplierId: data.supplierId ?? null,
            supplierName: supplierName ?? null,
          })
          .returning();

        res.status(201).json({ purchase: row });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Données invalides", details: error.errors });
        }
        console.error("[Purchases] Create error:", error);
        res.status(500).json({ error: "Erreur de création" });
      }
    },
  );

  // ============================== UPDATE ==============================
  app.patch(
    `${r}/:id`,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: "ID invalide" });

        const data = updatePurchaseSchema.parse(req.body);

        // Si supplierId change explicitement, on rafraîchit supplierName
        // (sauf si le caller envoie déjà supplierName explicite).
        const patch: Record<string, unknown> = { ...data };
        if (data.supplierId !== undefined && data.supplierName === undefined) {
          patch.supplierName = await resolveSupplierName(tid, data.supplierId);
        }

        const [row] = await db
          .update(purchases)
          .set(patch)
          .where(and(eq(purchases.id, id), eq(purchases.tenantId, tid)))
          .returning();

        if (!row) return res.status(404).json({ error: "Achat introuvable" });
        res.json({ purchase: row });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Données invalides", details: error.errors });
        }
        console.error("[Purchases] Update error:", error);
        res.status(500).json({ error: "Erreur de mise à jour" });
      }
    },
  );

  // ============================== PARSE (OCR) ==============================
  // Body : { imageBase64: string, mimeType: "image/jpeg|png|webp" }
  // Retourne les champs détectés, à appliquer côté UI sur le formulaire.
  // Auth : owner / admin / manager (opération coûteuse côté provider IA).
  const parseSchema = z.object({
    imageBase64: z.string().min(100), // un PNG vide fait déjà ~100B en base64
    mimeType: z.enum(SUPPORTED_MIME_TYPES),
  });

  app.post(
    `${r}/parse`,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const data = parseSchema.parse(req.body);

        const validation = validateBase64Image(data.imageBase64, data.mimeType);
        if (!validation.ok) {
          return res.status(400).json({ error: validation.error });
        }

        // Strip data URL prefix au cas où le client en envoie un.
        const clean = data.imageBase64.replace(/^data:[^,]+,/, "");

        const result = await parseInvoiceImage(clean, data.mimeType as SupportedMime);

        // Auto-match : si l'OCR a sorti un supplierName, on cherche un
        // fournisseur correspondant dans l'annuaire du tenant. Réduit le
        // clic supplémentaire dans 80% des cas (les achats récurrents).
        let suggestedSupplierId: number | null = null;
        if (result.fields.supplierName) {
          const candidates = await db
            .select({
              id: suppliers.id,
              name: suppliers.name,
              shortName: suppliers.shortName,
            })
            .from(suppliers)
            .where(and(eq(suppliers.tenantId, req.tenantId!), eq(suppliers.isActive, true)));
          suggestedSupplierId =
            matchSupplierByName(result.fields.supplierName, candidates)?.supplierId ?? null;
        }

        res.json({
          fields: result.fields,
          provider: result.provider,
          suggestedSupplierId,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Données invalides", details: error.errors });
        }
        const message = error instanceof Error ? error.message : "Erreur OCR";
        // Si aucun provider configuré → 503 (config), sinon 502 (upstream).
        if (message.startsWith("Aucun provider")) {
          return res.status(503).json({ error: message });
        }
        console.error("[Purchases] Parse error:", error);
        res.status(502).json({ error: message });
      }
    },
  );

  // ============================== DELETE (soft) ==============================
  app.delete(
    `${r}/:id`,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: "ID invalide" });

        const [row] = await db
          .update(purchases)
          .set({ isActive: false })
          .where(and(eq(purchases.id, id), eq(purchases.tenantId, tid)))
          .returning();

        if (!row) return res.status(404).json({ error: "Achat introuvable" });
        res.json({ success: true });
      } catch (error) {
        console.error("[Purchases] Delete error:", error);
        res.status(500).json({ error: "Erreur de suppression" });
      }
    },
  );

  // unused import guard (sum/asc) — keeps the snippet honest if linters strip
  void asc;
}
