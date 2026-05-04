/**
 * Tenant host detection — single source of truth for "are we on a tenant
 * subdomain or on the apex / a legacy path-based URL?".
 *
 * Used by App.tsx routing AND by tenant-scoped pages that need to build
 * internal links correctly:
 *   - subdomain  → /admin, /history, /management/...
 *   - non-subdomain → /:slug/admin, /:slug/history, /:slug/management/...
 */

const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "admin", "app", "static", "cdn",
  "mail", "blog", "status", "docs", "support", "help",
]);

const KNOWN_ROOT_DOMAINS = ["mybeez-ai.com", "localhost"];

/**
 * Returns the tenant slug if we're on a tenant subdomain
 * (`<slug>.mybeez-ai.com`), or `null` if we're on the apex
 * (`mybeez-ai.com`) or a reserved subdomain (api, admin, www, …).
 */
export function getTenantSlugFromHost(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  for (const root of KNOWN_ROOT_DOMAINS) {
    if (host === root) return null;
    if (host.endsWith(`.${root}`)) {
      const slug = host.slice(0, -root.length - 1);
      if (RESERVED_SUBDOMAINS.has(slug)) return null;
      // No nested subdomains for tenants (`foo.bar.mybeez-ai.com` not allowed).
      if (slug.includes(".")) return null;
      return slug;
    }
  }
  return null;
}

/**
 * Builds an internal link to a tenant section, using the right URL
 * shape depending on whether we're on the tenant subdomain or accessing
 * the app via the legacy `/:slug/...` path.
 */
export function tenantPath(slug: string, section: string): string {
  const onSubdomain = getTenantSlugFromHost() === slug;
  const clean = section.startsWith("/") ? section : `/${section}`;
  return onSubdomain ? clean : `/${slug}${clean}`;
}
