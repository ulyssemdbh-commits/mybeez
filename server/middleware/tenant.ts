/**
 * Tenant Resolution Middleware — myBeez
 *
 * Resolves the tenant from the :slug URL parameter.
 * Attaches tenant info to req for downstream use.
 */

import type { Request, Response, NextFunction } from "express";
import { tenantService } from "../services/tenantService";
import type { Tenant } from "../../shared/schema/tenants";

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      tenantId?: number;
    }
  }
}

export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  const slug = req.params.slug;
  if (!slug) {
    return res.status(400).json({ error: "Tenant slug required" });
  }

  const tenant = await tenantService.getBySlug(slug);
  if (!tenant) {
    return res.status(404).json({ error: `Restaurant inconnu: ${slug}` });
  }

  if (!tenant.isActive) {
    return res.status(403).json({ error: "Compte désactivé" });
  }

  req.tenant = tenant;
  req.tenantId = tenant.id;
  next();
}
