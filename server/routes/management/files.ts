/**
 * Files Routes — back-office gestion (Management).
 *
 * Mounted at `/api/management/:slug/files`.
 *
 * Endpoints (V1, port d'ulysseclaude — sans le post-processing intriqué) :
 *   GET    /                 list (filtres : category, search, includeArchived)
 *   POST   /                 upload (multipart, max 50MB)
 *   GET    /:id/download     stream binary
 *   DELETE /:id              soft-delete -> files_trash (TTL 7 jours)
 *   GET    /trash            list trash rows
 *   POST   /trash/:id/restore   restore si non-expiré (410 si expiré)
 *   DELETE /trash/:id        hard-delete (R2 + DB)
 *   POST   /send-email-bulk  email Resend N pièces jointes (V2 hook)
 *
 * Auth model :
 *   - READ (GET, download, list trash) : owner | admin | manager | staff | viewer
 *   - WRITE (upload, soft/hard-delete, restore, send-email) : owner | admin | manager
 *
 * Hors scope V2 (PR follow-up) : parse-preview, side-effects
 * vers expenses/purchases/payroll, payroll/import-pdf OCR.
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import { and, eq, ilike, inArray, or, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { files, filesTrash } from "../../../shared/schema/checklist";
import { tenants } from "../../../shared/schema/tenants";
import {
  buildStoredName,
  buildStorageKey,
  sanitiseFileName,
} from "../../services/files/naming";
import {
  uploadFileToStorage,
  downloadFileFromStorage,
  downloadFileBufferFromStorage,
  deleteFileFromStorage,
} from "../../services/files/storage";
import { computeExpiresAt, isExpired, TRASH_TTL_MS } from "../../services/files/trashService";
import { recordAudit } from "../../services/auth/auditService";
import { sendDocumentBundle } from "../../services/auth/mailService";

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin", "manager"] as const;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function parseId(param: string): number | null {
  const id = Number.parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const createFileMetaSchema = z.object({
  category: z.string().trim().min(1).max(60),
  fileType: z.string().trim().min(1).max(60).optional(),
  supplier: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  fileDate: z.string().trim().max(40).optional(),
});

const listQuerySchema = z.object({
  category: z.string().trim().max(60).optional(),
  search: z.string().trim().max(200).optional(),
});

const sendEmailBulkSchema = z.object({
  to: z.string().trim().email().max(254),
  fileIds: z.array(z.number().int().positive()).min(1).max(20),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
});

// Resend caps inbound payloads around 40 MB (encoded). We stay below to
// leave headroom for base64 expansion (~1.37×) and the email envelope.
const MAX_BULK_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function registerManagementFilesRoutes(app: Express): void {
  const r = "/api/management/:slug/files";

  // ============================== list ==============================
  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const q = listQuerySchema.parse(req.query);

      const conds = [eq(files.tenantId, tid)];
      if (q.category) conds.push(eq(files.category, q.category));
      if (q.search) {
        const term = `%${q.search}%`;
        const m = or(
          ilike(files.originalName, term),
          ilike(files.supplier, term),
          ilike(files.description, term),
        );
        if (m) conds.push(m);
      }

      const rows = await db
        .select()
        .from(files)
        .where(and(...conds))
        .orderBy(desc(files.createdAt));
      res.json({ files: rows });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtres invalides", details: error.errors });
      }
      console.error("[files] list error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== upload ==============================
  // multer middleware AVANT requireRole : sinon le client recoit un 401
  // sans le rate-limit auth, mais le serveur a deja parse le body inutilement.
  // Trade-off accepté : auth se fait apres le parsing (cohérent avec les
  // autres routes de management qui appellent body parsing avant).
  app.post(
    r,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const userId = (req.session as unknown as { userId?: number }).userId ?? null;

        if (!req.file) {
          return res.status(400).json({ error: "Aucun fichier reçu (champ 'file' attendu)" });
        }
        const data = createFileMetaSchema.parse(req.body);

        const storedName = buildStoredName(req.file.originalname);
        const storagePath = buildStorageKey(tid, storedName);

        await uploadFileToStorage(storagePath, req.file.buffer, req.file.mimetype);

        const [row] = await db
          .insert(files)
          .values({
            tenantId: tid,
            fileName: storedName,
            originalName: sanitiseFileName(req.file.originalname),
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            category: data.category,
            fileType: data.fileType ?? "file",
            supplier: data.supplier ?? null,
            description: data.description ?? null,
            fileDate: data.fileDate ?? null,
            storagePath,
          })
          .returning();

        void recordAudit({
          req,
          event: "files.uploaded",
          userId,
          metadata: {
            fileId: row!.id,
            category: row!.category,
            fileSize: row!.fileSize,
            mimeType: row!.mimeType,
          },
        });
        res.status(201).json({ file: row });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Métadonnées invalides", details: error.errors });
        }
        // multer: file-too-large
        if (error instanceof Error && error.message.includes("File too large")) {
          return res.status(413).json({ error: `Fichier trop gros (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` });
        }
        console.error("[files] upload error:", error);
        res.status(500).json({ error: "Erreur d'upload" });
      }
    },
  );

  // ============================== download ==============================
  app.get(`${r}/:id/download`, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .select()
        .from(files)
        .where(and(eq(files.tenantId, tid), eq(files.id, id)))
        .limit(1);

      if (!row) return res.status(404).json({ error: "Fichier introuvable" });

      const stream = await downloadFileFromStorage(row.storagePath);
      res.setHeader("Content-Type", row.mimeType);
      res.setHeader("Content-Length", String(row.fileSize));
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${row.originalName.replace(/"/g, "")}"`,
      );
      stream.pipe(res);
    } catch (error) {
      console.error("[files] download error:", error);
      res.status(500).json({ error: "Erreur de téléchargement" });
    }
  });

  // ============================== soft-delete (move to trash) ==============================
  app.delete(`${r}/:id`, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .select()
        .from(files)
        .where(and(eq(files.tenantId, tid), eq(files.id, id)))
        .limit(1);

      if (!row) return res.status(404).json({ error: "Fichier introuvable" });

      const deletedAt = new Date();
      const expiresAt = computeExpiresAt(deletedAt);

      await db.transaction(async (tx) => {
        await tx.insert(filesTrash).values({
          tenantId: tid,
          originalFileId: row.id,
          fileName: row.fileName,
          originalName: row.originalName,
          mimeType: row.mimeType,
          fileSize: row.fileSize,
          category: row.category,
          fileType: row.fileType,
          supplier: row.supplier,
          description: row.description,
          fileDate: row.fileDate,
          storagePath: row.storagePath,
          emailedTo: row.emailedTo,
          deletedAt,
          expiresAt,
          originalCreatedAt: row.createdAt,
        });
        await tx.delete(files).where(and(eq(files.tenantId, tid), eq(files.id, id)));
      });

      void recordAudit({
        req,
        event: "files.trashed",
        userId,
        metadata: { fileId: row.id, expiresAt: expiresAt.toISOString(), ttlDays: TRASH_TTL_MS / 86_400_000 },
      });
      res.json({ success: true, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      console.error("[files] soft-delete error:", error);
      res.status(500).json({ error: "Erreur de suppression" });
    }
  });

  // ============================== list trash ==============================
  app.get(`${r}/trash`, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const rows = await db
        .select()
        .from(filesTrash)
        .where(eq(filesTrash.tenantId, tid))
        .orderBy(desc(filesTrash.deletedAt));
      res.json({ files: rows });
    } catch (error) {
      console.error("[files] trash list error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== restore ==============================
  app.post(`${r}/trash/:id/restore`, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .select()
        .from(filesTrash)
        .where(and(eq(filesTrash.tenantId, tid), eq(filesTrash.id, id)))
        .limit(1);

      if (!row) return res.status(404).json({ error: "Fichier introuvable dans la corbeille" });

      if (isExpired(row.expiresAt)) {
        return res.status(410).json({ error: "Ce fichier a expiré et ne peut plus être restauré" });
      }

      const [restored] = await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(files)
          .values({
            tenantId: tid,
            fileName: row.fileName,
            originalName: row.originalName,
            mimeType: row.mimeType,
            fileSize: row.fileSize,
            category: row.category,
            fileType: row.fileType,
            supplier: row.supplier,
            description: row.description,
            fileDate: row.fileDate,
            storagePath: row.storagePath,
            emailedTo: row.emailedTo,
          })
          .returning();
        await tx.delete(filesTrash).where(and(eq(filesTrash.tenantId, tid), eq(filesTrash.id, id)));
        return [r];
      });

      void recordAudit({
        req,
        event: "files.restored",
        userId,
        metadata: { fileId: restored!.id, originalFileId: row.originalFileId },
      });
      res.json({ file: restored });
    } catch (error) {
      console.error("[files] restore error:", error);
      res.status(500).json({ error: "Erreur de restauration" });
    }
  });

  // ============================== hard-delete from trash ==============================
  app.delete(`${r}/trash/:id`, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .select()
        .from(filesTrash)
        .where(and(eq(filesTrash.tenantId, tid), eq(filesTrash.id, id)))
        .limit(1);

      if (!row) return res.status(404).json({ error: "Fichier introuvable dans la corbeille" });

      await deleteFileFromStorage(row.storagePath);
      await db
        .delete(filesTrash)
        .where(and(eq(filesTrash.tenantId, tid), eq(filesTrash.id, id)));

      void recordAudit({
        req,
        event: "files.purged",
        userId,
        metadata: { originalFileId: row.originalFileId, source: "manual" },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("[files] hard-delete error:", error);
      res.status(500).json({ error: "Erreur de suppression définitive" });
    }
  });

  // ============================== send-email-bulk (V2 hook) ==============================
  app.post(
    `${r}/send-email-bulk`,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const userId = (req.session as unknown as { userId?: number }).userId ?? null;
        const body = sendEmailBulkSchema.parse(req.body);

        const rows = await db
          .select()
          .from(files)
          .where(and(eq(files.tenantId, tid), inArray(files.id, body.fileIds)));

        if (rows.length === 0) {
          return res.status(404).json({ error: "Aucun fichier trouvé" });
        }
        if (rows.length !== body.fileIds.length) {
          const found = new Set(rows.map((r) => r.id));
          const missing = body.fileIds.filter((id) => !found.has(id));
          return res.status(404).json({ error: "Fichier(s) introuvable(s)", missingIds: missing });
        }

        const totalSize = rows.reduce((s, r) => s + r.fileSize, 0);
        if (totalSize > MAX_BULK_ATTACHMENT_BYTES) {
          return res.status(413).json({
            error: `Total des pièces jointes trop lourd (${Math.round(totalSize / 1024 / 1024)}MB, max ${MAX_BULK_ATTACHMENT_BYTES / 1024 / 1024}MB)`,
          });
        }

        const [tenantRow] = await db
          .select({ name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, tid))
          .limit(1);
        const tenantName = tenantRow?.name ?? "myBeez";

        const attachments = await Promise.all(
          rows.map(async (r) => ({
            filename: r.originalName,
            content: await downloadFileBufferFromStorage(r.storagePath),
          })),
        );

        const result = await sendDocumentBundle({
          to: { email: body.to },
          tenantName,
          fileNames: rows.map((r) => r.originalName),
          subject: body.subject,
          message: body.message,
          attachments,
        });

        // Append `to` to emailedTo[] for each file. array_append handles
        // null cleanly (returns ARRAY[to]). Drizzle has no first-class
        // helper for array_append, so we use sql`...` with COALESCE.
        await db
          .update(files)
          .set({
            emailedTo: sql`COALESCE(${files.emailedTo}, ARRAY[]::text[]) || ARRAY[${body.to}]::text[]`,
          })
          .where(and(eq(files.tenantId, tid), inArray(files.id, body.fileIds)));

        void recordAudit({
          req,
          event: "files.emailed",
          userId,
          metadata: {
            fileIds: body.fileIds,
            to: body.to,
            count: rows.length,
            totalSize,
            provider: result.provider,
          },
        });

        res.json({ success: true, count: rows.length, provider: result.provider });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Paramètres invalides", details: error.errors });
        }
        console.error("[files] send-email-bulk error:", error);
        res.status(500).json({ error: "Erreur d'envoi email" });
      }
    },
  );
}
