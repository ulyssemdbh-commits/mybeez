/**
 * History cross-module Route — back-office gestion (Management).
 *
 * Mounted at `/api/management/:slug/history`.
 *
 *   GET /                 unified feed of audit_log rows (tenant-scoped)
 *                         + decoration (module, action, label, entityRef)
 *
 *   Filters :
 *     ?module=purchases|expenses|files|...     filter by audit `event` prefix
 *     ?action=created|updated|...              filter by audit `event` middle segment
 *     ?from=YYYY-MM-DD  / ?to=YYYY-MM-DD       range on `created_at`
 *     ?userId=N                                filter by acting user
 *     ?limit=N (1..200, default 50)            page size
 *     ?offset=N (default 0)                    page offset
 *
 *   Response :
 *     { items: DecoratedHistoryRow[], total, hasMore }
 *
 * RBAC : all tenant roles. The feed is read-only, no privacy concern
 * beyond what tenant scoping already guarantees — audit_log rows
 * carrying `tenant_id = req.tenantId` are by definition relevant to
 * the staff who can see the tenant.
 *
 * Sprint 7 module métier (PR #88). Decoration logic lives in
 * `services/history/historyDecorator.ts` (pure, testable).
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, lte, like, count, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { auditLog } from "../../../shared/schema/users";
import { decorateRow, FILTERABLE_MODULES } from "../../services/history/historyDecorator";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("History");

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu YYYY-MM-DD");

const listQuerySchema = z.object({
  // Module accepted as a free-form string here ; we validate against the
  // canonical list in `FILTERABLE_MODULES` below to keep the error message
  // helpful (Zod's enum() would just say "invalid enum value").
  module: z.string().trim().min(1).max(40).optional(),
  action: z.string().trim().min(1).max(40).optional(),
  from: ISO_DATE.optional(),
  to: ISO_DATE.optional(),
  userId: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive())
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(200))
    .optional(),
  offset: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(0).max(100_000))
    .optional(),
});

export function registerManagementHistoryRoutes(app: Express): void {
  const r = "/api/management/:slug/history";

  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const q = listQuerySchema.parse(req.query);

      if (q.module && !FILTERABLE_MODULES.includes(q.module)) {
        return res.status(400).json({
          error: "Module inconnu",
          field: "module",
          allowed: FILTERABLE_MODULES,
        });
      }

      const limit = q.limit ?? 50;
      const offset = q.offset ?? 0;

      // Build conditions. tenantId is non-negotiable.
      const conds = [eq(auditLog.tenantId, tid)];
      if (q.module) {
        // event LIKE 'module.%' — the '.' is what guarantees prefix match
        // and not a substring (e.g. `module=files` won't match `filesTrash`).
        conds.push(like(auditLog.event, `${q.module}.%`));
      }
      if (q.action) {
        // module.action.outcome — match the middle segment via SQL LIKE.
        // `%.action.%` covers domain.action.success + domain.action and
        // `%.action` covers the no-outcome case.
        conds.push(
          sql`(${auditLog.event} LIKE ${`%.${q.action}.%`} OR ${auditLog.event} LIKE ${`%.${q.action}`})`,
        );
      }
      if (q.from) {
        // createdAt is timestamp ; YYYY-MM-DD becomes start-of-day.
        conds.push(gte(auditLog.createdAt, new Date(`${q.from}T00:00:00Z`)));
      }
      if (q.to) {
        // Inclusive upper bound : end of day.
        conds.push(lte(auditLog.createdAt, new Date(`${q.to}T23:59:59.999Z`)));
      }
      if (q.userId !== undefined) {
        conds.push(eq(auditLog.userId, q.userId));
      }

      // Two queries in parallel : the page + total. `count(*)` could be
      // expensive on large audit_log volumes ; for V1 we live with it
      // and can move to `hasMore` cursor-based pagination if it becomes
      // a hotspot.
      const [items, [{ total }]] = await Promise.all([
        db
          .select()
          .from(auditLog)
          .where(and(...conds))
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count(auditLog.id) })
          .from(auditLog)
          .where(and(...conds)),
      ]);

      const decorated = items.map((row) =>
        decorateRow({
          id: row.id,
          createdAt: row.createdAt,
          event: row.event,
          userId: row.userId,
          tenantId: row.tenantId,
          metadata: row.metadata,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
        }),
      );

      res.json({
        items: decorated,
        total: Number(total),
        limit,
        offset,
        hasMore: offset + items.length < Number(total),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtres invalides", details: error.errors });
      }
      log.error({ err: error }, "list error");
      res.status(500).json({ error: "Erreur" });
    }
  });
}
