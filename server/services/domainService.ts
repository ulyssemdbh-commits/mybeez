/**
 * Domain Service — myBeez
 *
 * Resolves a tenant from an HTTP host (incoming request hostname).
 *
 * Resolution strategy:
 *   1. Strip port + lowercase
 *   2. If host equals one of ROOT_DOMAINS → apex (no tenant)
 *   3. If host endsWith `.<root>` for some root → subdomain = host minus root
 *      → tenantService.getBySlug(subdomain)
 *   4. Else → custom domain lookup in `tenant_domains` (must be verified)
 *
 * ROOT_DOMAINS env var: comma-separated list (default `mybeez.com,localhost`).
 *
 * The default subdomain `<slug>.mybeez.com` is NEVER stored in
 * `tenant_domains` — it is computed. Only customer-owned hostnames are
 * persisted there.
 */

import { db } from "../db";
import { tenantDomains, type TenantDomain } from "../../shared/schema/domains";
import { tenantService } from "./tenantService";
import type { Tenant } from "../../shared/schema/tenants";
import { and, eq, isNotNull } from "drizzle-orm";

function getRootDomains(): string[] {
  const raw = process.env.ROOT_DOMAINS || "mybeez.com,localhost";
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Normalises a Host header value.
 *
 * - Lowercases
 * - Strips port (`:3000`)
 * - Strips trailing dot (FQDN form)
 *
 * Returns null for an empty / invalid value.
 */
export function normalizeHost(host: string | undefined | null): string | null {
  if (!host) return null;
  let h = host.trim().toLowerCase();
  if (!h) return null;
  const colon = h.indexOf(":");
  if (colon !== -1) h = h.slice(0, colon);
  if (h.endsWith(".")) h = h.slice(0, -1);
  return h || null;
}

export interface HostMatch {
  type: "apex" | "subdomain" | "custom";
  root?: string;
  subdomain?: string;
}

/**
 * Classifies a normalised host against ROOT_DOMAINS without hitting the DB.
 * Pure function — used by `resolveTenantByHost` and unit tests.
 */
export function classifyHost(host: string, roots: string[] = getRootDomains()): HostMatch {
  for (const root of roots) {
    if (host === root) return { type: "apex", root };
    if (host.endsWith("." + root)) {
      return { type: "subdomain", root, subdomain: host.slice(0, -(root.length + 1)) };
    }
  }
  return { type: "custom" };
}

interface DomainCacheEntry {
  tenantId: number;
  expiresAt: number;
}

const CUSTOM_DOMAIN_CACHE_TTL_MS = 60_000;
const customDomainCache = new Map<string, DomainCacheEntry>();

export function clearDomainCache(): void {
  customDomainCache.clear();
}

async function lookupCustomDomain(host: string): Promise<TenantDomain | null> {
  const [row] = await db
    .select()
    .from(tenantDomains)
    .where(and(eq(tenantDomains.hostname, host), isNotNull(tenantDomains.verifiedAt)));
  return row ?? null;
}

/**
 * Resolves the tenant for a given Host header value.
 *
 * Returns:
 *   - { tenant }                    on subdomain or verified custom domain
 *   - { tenant: null, type: 'apex' } when the host is the apex root domain
 *   - { tenant: null, type: 'unknown' } otherwise
 */
export async function resolveTenantByHost(
  host: string | undefined | null,
): Promise<{ tenant: Tenant | null; match: HostMatch | null }> {
  const normalised = normalizeHost(host);
  if (!normalised) return { tenant: null, match: null };

  const match = classifyHost(normalised);

  if (match.type === "apex") {
    return { tenant: null, match };
  }

  if (match.type === "subdomain" && match.subdomain) {
    const tenant = await tenantService.getBySlug(match.subdomain);
    return { tenant, match };
  }

  const cached = customDomainCache.get(normalised);
  if (cached && cached.expiresAt > Date.now()) {
    const tenant = await tenantService.getById(cached.tenantId);
    return { tenant, match };
  }

  const row = await lookupCustomDomain(normalised);
  if (!row) {
    return { tenant: null, match };
  }

  customDomainCache.set(normalised, {
    tenantId: row.tenantId,
    expiresAt: Date.now() + CUSTOM_DOMAIN_CACHE_TTL_MS,
  });

  const tenant = await tenantService.getById(row.tenantId);
  return { tenant, match };
}
