/**
 * Payroll Routes — fiches de paie. Mounted at
 * `/api/management/:slug/payroll`.
 *
 *   GET    /                  list (filters: ?period=YYYY-MM&employeeId=N)
 *   GET    /:id               detail
 *   POST   /                  create (rejects duplicate employee+month)
 *   PATCH  /:id               update
 *   DELETE /:id               hard-delete (history is in audit_log)
 *   POST   /import-pdf        OCR a payslip PDF/image, archive in files,
 *                             auto-match (or auto-create) employee, insert payroll
 *   POST   /reparse-all       Iterate orphan RH bulletins, run import for each
 */

import type { Express, Request, Response } from "express";
import { and, eq, desc, notInArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { payroll, employees, files } from "../../../shared/schema/checklist";
import { recordAudit } from "../../services/auth/auditService";
import {
  parsePayslipImage,
  type PayslipFields,
} from "../../services/parsing/payslipParser";
import {
  validateBase64Image,
  SUPPORTED_MIME_TYPES,
  type SupportedMime,
} from "../../services/parsing/invoiceParser";
import {
  buildEmployeeValues,
  buildPayrollValues,
  payslipImportEligibility,
  summarizeImportWarnings,
} from "../../services/payroll/payrollImport";
import { matchEmployee } from "../../services/hr/employeeMatching";
import {
  buildStoredName,
  buildStorageKey,
  sanitiseFileName,
} from "../../services/files/naming";
import {
  uploadFileToStorage,
  downloadFileBufferFromStorage,
} from "../../services/files/storage";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("Payroll");

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin", "manager"] as const;

function parseId(param: string): number | null {
  const id = Number.parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/, "Période doit être au format YYYY-MM");

const optNumber = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  })
  .optional();

const requiredNumber = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const n = Number.parseFloat(v);
    if (!Number.isFinite(n)) throw new Error("not a number");
    return n;
  });

const payrollBaseFields = {
  employeeId: z.number().int().positive(),
  month: periodSchema,
  grossSalary: requiredNumber,
  netSalary: requiredNumber,
  socialCharges: optNumber,
  employerCharges: optNumber,
  totalEmployerCost: optNumber,
  bonuses: optNumber,
  overtime: optNumber,
  deductions: optNumber,
  status: z.string().trim().max(40).optional(),
  isPaid: z.boolean().optional(),
  paidDate: z.string().trim().max(40).optional(),
  pdfFileId: z.number().int().positive().optional(),
  notes: z.string().trim().max(2000).optional(),
};

const createPayrollSchema = z.object(payrollBaseFields);
const updatePayrollSchema = z
  .object(payrollBaseFields)
  .partial()
  .omit({ employeeId: true, month: true });

const listQuerySchema = z.object({
  period: periodSchema.optional(),
  employeeId: z
    .union([z.string(), z.number()])
    .transform((v) => Number.parseInt(String(v), 10))
    .refine((n) => Number.isFinite(n) && n > 0, "employeeId invalide")
    .optional(),
});

export function registerManagementPayrollRoutes(app: Express): void {
  const r = "/api/management/:slug/payroll";

  // ============================== list ==============================
  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const q = listQuerySchema.parse(req.query);
      const conds = [eq(payroll.tenantId, tid)];
      if (q.period) conds.push(eq(payroll.month, q.period));
      if (q.employeeId) conds.push(eq(payroll.employeeId, q.employeeId));
      const rows = await db
        .select()
        .from(payroll)
        .where(and(...conds))
        .orderBy(desc(payroll.month), desc(payroll.id));
      res.json({ payroll: rows });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtres invalides", details: error.errors });
      }
      log.error({ err: error }, "list error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== detail ==============================
  app.get(`${r}/:id`, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });
      const [row] = await db
        .select()
        .from(payroll)
        .where(and(eq(payroll.tenantId, tid), eq(payroll.id, id)))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Fiche introuvable" });
      res.json({ payroll: row });
    } catch (error) {
      log.error({ err: error }, "detail error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== create ==============================
  app.post(r, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const data = createPayrollSchema.parse(req.body);

      try {
        const [row] = await db
          .insert(payroll)
          .values({ ...data, tenantId: tid })
          .returning();

        void recordAudit({
          req,
          event: "payroll.created",
          userId,
          metadata: {
            payrollId: row!.id,
            employeeId: row!.employeeId,
            month: row!.month,
            grossSalary: row!.grossSalary,
          },
        });
        res.status(201).json({ payroll: row });
      } catch (dbErr) {
        // Unique constraint on (tenant, employee, month).
        if (dbErr instanceof Error && /unique|duplicate/i.test(dbErr.message)) {
          return res
            .status(409)
            .json({ error: "Une fiche existe déjà pour cet employé et ce mois" });
        }
        throw dbErr;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      log.error({ err: error }, "create error");
      res.status(500).json({ error: "Erreur de création" });
    }
  });

  // ============================== update ==============================
  app.patch(`${r}/:id`, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });
      const data = updatePayrollSchema.parse(req.body);

      const [row] = await db
        .update(payroll)
        .set(data)
        .where(and(eq(payroll.tenantId, tid), eq(payroll.id, id)))
        .returning();

      if (!row) return res.status(404).json({ error: "Fiche introuvable" });
      void recordAudit({
        req,
        event: "payroll.updated",
        userId,
        metadata: { payrollId: row.id, fields: Object.keys(data) },
      });
      res.json({ payroll: row });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      log.error({ err: error }, "update error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== delete ==============================
  app.delete(`${r}/:id`, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .delete(payroll)
        .where(and(eq(payroll.tenantId, tid), eq(payroll.id, id)))
        .returning();

      if (!row) return res.status(404).json({ error: "Fiche introuvable" });
      void recordAudit({
        req,
        event: "payroll.deleted",
        userId,
        metadata: { payrollId: row.id, employeeId: row.employeeId, month: row.month },
      });
      res.json({ success: true });
    } catch (error) {
      log.error({ err: error }, "delete error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== import-pdf ==============================
  // Body : { pdfBase64, originalName, mimeType, autoCreateEmployee? }
  // Flow : OCR → match employee → upload R2 + insert files → insert payroll.
  // Sync (no job queue) — volumetry expected < 10 bulletins/month per tenant.
  const importPdfSchema = z.object({
    pdfBase64: z.string().min(100),
    originalName: z.string().trim().min(1).max(255),
    mimeType: z.enum(SUPPORTED_MIME_TYPES),
    autoCreateEmployee: z.boolean().optional().default(false),
  });

  app.post(
    `${r}/import-pdf`,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const userId = (req.session as unknown as { userId?: number }).userId ?? null;
        const body = importPdfSchema.parse(req.body);

        const validation = validateBase64Image(body.pdfBase64, body.mimeType);
        if (!validation.ok) {
          return res.status(400).json({ error: validation.error });
        }

        const cleanBase64 = body.pdfBase64.replace(/^data:[^,]+,/, "");

        // 1. OCR
        let parsed: { provider: string; fields: PayslipFields };
        try {
          parsed = await parsePayslipImage(cleanBase64, body.mimeType as SupportedMime);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erreur OCR";
          if (msg.startsWith("Aucun provider")) {
            return res.status(503).json({ error: msg });
          }
          log.error({ err: err }, "import-pdf OCR error");
          return res.status(502).json({ error: msg });
        }

        // 2. Eligibility (period + gross + net non-null)
        const eligibility = payslipImportEligibility(parsed.fields);
        if (!eligibility.ok) {
          return res.status(422).json({
            error: eligibility.error,
            parsed: { fields: parsed.fields, provider: parsed.provider },
          });
        }

        // 3. Match (or optionally auto-create) employee
        const candidates = await db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            socialSecurityNumber: employees.socialSecurityNumber,
          })
          .from(employees)
          .where(and(eq(employees.tenantId, tid), eq(employees.isActive, true)));

        const matchResult = matchEmployee(
          {
            firstName: parsed.fields.firstName,
            lastName: parsed.fields.lastName,
            socialSecurityNumber: parsed.fields.socialSecurityNumber,
          },
          candidates,
        );

        let employeeId: number | null = matchResult.employeeId;
        let createdEmployee = false;

        if (employeeId === null) {
          if (!body.autoCreateEmployee) {
            return res.status(422).json({
              error:
                "Employé introuvable dans la liste active. Activez `autoCreateEmployee` ou créez l'employé manuellement.",
              parsed: { fields: parsed.fields, provider: parsed.provider, matchTier: matchResult.tier },
            });
          }
          const stub = buildEmployeeValues(parsed.fields);
          if (!stub) {
            return res.status(422).json({
              error: "Création automatique impossible : prénom et nom non détectés sur le bulletin.",
              parsed: { fields: parsed.fields, provider: parsed.provider, matchTier: matchResult.tier },
            });
          }
          const [newEmp] = await db
            .insert(employees)
            .values({ ...stub, tenantId: tid })
            .returning();
          employeeId = newEmp!.id;
          createdEmployee = true;
          void recordAudit({
            req,
            event: "employees.created",
            userId,
            metadata: { employeeId, source: "payroll.import-pdf" },
          });
        }

        // 4. Pre-check duplicate (tenant, employee, month) — clearer error than
        //    waiting for the UNIQUE constraint to fire mid-transaction.
        const period = parsed.fields.period!;
        const [existing] = await db
          .select({ id: payroll.id })
          .from(payroll)
          .where(
            and(
              eq(payroll.tenantId, tid),
              eq(payroll.employeeId, employeeId),
              eq(payroll.month, period),
            ),
          )
          .limit(1);
        if (existing) {
          return res.status(409).json({
            error: "Une fiche existe déjà pour cet employé et ce mois.",
            payrollId: existing.id,
            employeeId,
            month: period,
          });
        }

        // 5. Upload PDF to R2 + insert files row + insert payroll row.
        //    R2 upload is outside the DB transaction (no rollback on R2 if
        //    DB fails, the orphan blob is acceptable — same trade-off as the
        //    Files module upload route).
        const buffer = Buffer.from(cleanBase64, "base64");
        const storedName = buildStoredName(body.originalName);
        const storagePath = buildStorageKey(tid, storedName);
        await uploadFileToStorage(storagePath, buffer, body.mimeType);

        const fileDate = parsed.fields.paidDate ?? `${period}-01`;

        const { fileRow, payrollRow } = await db.transaction(async (tx) => {
          const [f] = await tx
            .insert(files)
            .values({
              tenantId: tid,
              fileName: storedName,
              originalName: sanitiseFileName(body.originalName),
              mimeType: body.mimeType,
              fileSize: buffer.length,
              category: "rh",
              fileType: "bulletin_paie",
              description: `Bulletin de paie ${period}`,
              fileDate,
              storagePath,
              employeeId,
            })
            .returning();
          const values = buildPayrollValues({
            fields: parsed.fields,
            employeeId: employeeId!,
            pdfFileId: f!.id,
          });
          const [p] = await tx
            .insert(payroll)
            .values({ ...values, tenantId: tid })
            .returning();
          return { fileRow: f!, payrollRow: p! };
        });

        const warnings = summarizeImportWarnings(parsed.fields);

        void recordAudit({
          req,
          event: "payroll.imported",
          userId,
          metadata: {
            payrollId: payrollRow.id,
            employeeId,
            month: period,
            fileId: fileRow.id,
            createdEmployee,
            matchTier: matchResult.tier,
            provider: parsed.provider,
          },
        });

        res.status(201).json({
          payroll: payrollRow,
          file: fileRow,
          employeeId,
          createdEmployee,
          parsed: {
            fields: parsed.fields,
            provider: parsed.provider,
            matchTier: matchResult.tier,
          },
          warnings,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Paramètres invalides", details: error.errors });
        }
        // Race condition fallback: UNIQUE(tenant, employee, month) hit
        // because two imports landed at once after our pre-check.
        if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
          return res
            .status(409)
            .json({ error: "Une fiche existe déjà pour cet employé et ce mois (race)." });
        }
        log.error({ err: error }, "import-pdf error");
        res.status(500).json({ error: "Erreur d'import" });
      }
    },
  );

  // ============================== reparse-all ==============================
  // Iterate `files` rows for the tenant where category=rh + fileType=bulletin_paie
  // and no payroll row references them, OCR each, insert a payroll row when
  // the parse + match succeed. Capped at MAX_REPARSE_BATCH per call to keep
  // the request synchronous and provider costs predictable.
  const MAX_REPARSE_BATCH = 50;

  const reparseAllSchema = z.object({
    autoCreateEmployee: z.boolean().optional().default(false),
    employeeId: z.number().int().positive().optional(),
  });

  app.post(
    `${r}/reparse-all`,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const userId = (req.session as unknown as { userId?: number }).userId ?? null;
        const body = reparseAllSchema.parse(req.body ?? {});

        // Build the orphan-files set: bulletins de paie not yet linked to
        // a payroll row. We pre-fetch the linked pdfFileIds and exclude
        // them via notInArray (Drizzle has no native left-join NOT EXISTS).
        const linkedRows = await db
          .select({ pdfFileId: payroll.pdfFileId })
          .from(payroll)
          .where(and(eq(payroll.tenantId, tid), isNotNull(payroll.pdfFileId)));
        const linkedIds = linkedRows
          .map((r) => r.pdfFileId)
          .filter((id): id is number => typeof id === "number");

        const fileConds = [
          eq(files.tenantId, tid),
          eq(files.category, "rh"),
          eq(files.fileType, "bulletin_paie"),
        ];
        if (linkedIds.length > 0) {
          fileConds.push(notInArray(files.id, linkedIds));
        }
        if (body.employeeId !== undefined) {
          fileConds.push(eq(files.employeeId, body.employeeId));
        }
        const orphans = await db
          .select()
          .from(files)
          .where(and(...fileConds))
          .orderBy(desc(files.createdAt))
          .limit(MAX_REPARSE_BATCH);

        const candidates = await db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            socialSecurityNumber: employees.socialSecurityNumber,
          })
          .from(employees)
          .where(and(eq(employees.tenantId, tid), eq(employees.isActive, true)));

        let scanned = 0;
        let created = 0;
        const errored: Array<{ fileId: number; error: string }> = [];

        for (const orphan of orphans) {
          scanned += 1;
          try {
            const buffer = await downloadFileBufferFromStorage(orphan.storagePath);
            const base64 = buffer.toString("base64");
            const mime = orphan.mimeType as SupportedMime;
            if (!SUPPORTED_MIME_TYPES.includes(mime)) {
              throw new Error(`MIME non supporté pour OCR: ${orphan.mimeType}`);
            }
            const parsed = await parsePayslipImage(base64, mime);
            const eligibility = payslipImportEligibility(parsed.fields);
            if (!eligibility.ok) {
              throw new Error(eligibility.error);
            }

            const matchResult = matchEmployee(
              {
                firstName: parsed.fields.firstName,
                lastName: parsed.fields.lastName,
                socialSecurityNumber: parsed.fields.socialSecurityNumber,
              },
              candidates,
            );
            let empId = matchResult.employeeId ?? orphan.employeeId ?? null;

            if (empId === null) {
              if (!body.autoCreateEmployee) {
                throw new Error("Employé introuvable (autoCreateEmployee=false).");
              }
              const stub = buildEmployeeValues(parsed.fields);
              if (!stub) {
                throw new Error("Création auto impossible (nom/prénom absents).");
              }
              const [newEmp] = await db
                .insert(employees)
                .values({ ...stub, tenantId: tid })
                .returning();
              empId = newEmp!.id;
              candidates.push({
                id: newEmp!.id,
                firstName: newEmp!.firstName,
                lastName: newEmp!.lastName,
                socialSecurityNumber: newEmp!.socialSecurityNumber ?? null,
              });
              void recordAudit({
                req,
                event: "employees.created",
                userId,
                metadata: { employeeId: empId, source: "payroll.reparse-all" },
              });
            }

            // Skip if a payroll already exists for (employee, month) — possibly
            // because another file with the same period was already linked.
            const period = parsed.fields.period!;
            const [dup] = await db
              .select({ id: payroll.id })
              .from(payroll)
              .where(
                and(
                  eq(payroll.tenantId, tid),
                  eq(payroll.employeeId, empId),
                  eq(payroll.month, period),
                ),
              )
              .limit(1);
            if (dup) {
              throw new Error(`Fiche déjà existante pour ${period} (#${dup.id}).`);
            }

            const values = buildPayrollValues({
              fields: parsed.fields,
              employeeId: empId,
              pdfFileId: orphan.id,
            });
            await db.transaction(async (tx) => {
              await tx.insert(payroll).values({ ...values, tenantId: tid });
              // Backfill files.employeeId if it was null and we now know it.
              if (orphan.employeeId === null) {
                await tx
                  .update(files)
                  .set({ employeeId: empId })
                  .where(and(eq(files.tenantId, tid), eq(files.id, orphan.id)));
              }
            });

            created += 1;
            void recordAudit({
              req,
              event: "payroll.imported",
              userId,
              metadata: {
                employeeId: empId,
                month: period,
                fileId: orphan.id,
                source: "reparse-all",
                provider: parsed.provider,
                matchTier: matchResult.tier,
              },
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errored.push({ fileId: orphan.id, error: msg });
          }
        }

        res.json({
          scanned,
          created,
          errored: errored.length,
          errors: errored,
          batchLimit: MAX_REPARSE_BATCH,
          remaining: orphans.length === MAX_REPARSE_BATCH ? "more" : "none",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Paramètres invalides", details: error.errors });
        }
        log.error({ err: error }, "reparse-all error");
        res.status(500).json({ error: "Erreur" });
      }
    },
  );

}
