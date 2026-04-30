/**
 * Tenant Resolution Middleware — myBeez
 *
 * Resolution order (PR #7):
 *   1. Try the request hostname (subdomain or verified custom domain)
 *      via `domainService.resolveTenantByHost`.
 *   2. If that fails AND `req.params.slug` is present, fall back to the
 *      legacy slug-based resolution (backward compat during the
 *      transition; will be removed once all clients use host-based URLs).
 *
 * If both resolutions yield a tenant and `:slug` is present, the slug
 * MUST match the host-resolved tenant — otherwise we return 400 to avoid
 * confusing cross-tenant access patterns.
 *
 * Attaches `req.tenant` and `req.tenantId` for downstream handlers.
 */

import type { Request, Response, NextFunction } from "express";
import { tenantService } from "../services/tenantService";
import { resolveTenantByHost } from "../services/domainService";
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

  const { tenant: hostTenant, match } = await resolveTenantByHost(req.hostname);

  if (hostTenant) {
    if (slug && slug !== hostTenant.slug) {
      return res.status(400).json({
        error: "Slug URL ne correspond pas au domaine du tenant",
      });
    }
    if (!hostTenant.isActive) {
      return res.status(403).json({ error: "Compte désactivé" });
    }
    req.tenant = hostTenant;
    req.tenantId = hostTenant.id;
    return next();
  }

  if (match?.type === "subdomain") {
    return res.status(404).json({
      error: `Tenant inconnu pour le domaine ${req.hostname}`,
    });
  }

  if (!slug) {
    return res.status(400).json({ error: "Tenant slug required" });
  }

  const tenant = await tenantService.getBySlug(slug);
  if (!tenant) {
    return res.status(404).json({ error: `Tenant inconnu: ${slug}` });
  }
  if (!tenant.isActive) {
    return res.status(403).json({ error: "Compte désactivé" });
  }

  req.tenant = tenant;
  req.tenantId = tenant.id;
  next();
}
