import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SkipLink } from "@/components/SkipLink";
import { Logo } from "@/components/Logo";

const TenantChecklist = lazy(() => import("@/pages/TenantChecklist"));
const TenantAdmin = lazy(() => import("@/pages/TenantAdmin"));
const TenantHistory = lazy(() => import("@/pages/TenantHistory"));
const TenantManagement = lazy(() => import("@/pages/TenantManagement"));
const AuthLogin = lazy(() => import("@/pages/AuthLogin"));
const AuthSignup = lazy(() => import("@/pages/AuthSignup"));
const AuthForgotPassword = lazy(() => import("@/pages/AuthForgotPassword"));
const AuthResetPassword = lazy(() => import("@/pages/AuthResetPassword"));
const AuthVerify = lazy(() => import("@/pages/AuthVerify"));
const Landing = lazy(() => import("@/pages/Landing"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminTenant = lazy(() => import("@/pages/AdminTenant"));

const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "admin", "app", "static", "cdn",
  "mail", "blog", "status", "docs", "support", "help",
]);

const KNOWN_ROOT_DOMAINS = ["mybeez-ai.com", "localhost"];

/**
 * Returns the tenant slug if we're on a tenant subdomain (`<slug>.mybeez-ai.com`),
 * or null if we're on the apex (`mybeez-ai.com`) or a reserved subdomain
 * (api, admin, www, …).
 */
function getTenantSlugFromHost(): string | null {
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

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center" role="status">
        <div className="text-center space-y-3">
          <Logo variant="picto" className="w-12 h-12 mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    }>
      {children}
    </Suspense>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Page non trouvée</h2>
        <p className="text-muted-foreground">Vérifiez l'URL ou contactez votre administrateur.</p>
        <a href="/" className="text-primary hover:underline text-sm">Retour à l'accueil</a>
      </div>
    </div>
  );
}

function App() {
  const tenantSlug = getTenantSlugFromHost();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" storageKey="mybeez-theme">
        <QueryClientProvider client={queryClient}>
          <SkipLink />
          <main id="main-content">
            <Switch>
              {/* Tenant routes — only when on `<slug>.<root>` */}
              {tenantSlug && (
                <Route path="/">
                  {() => <LazyPage><TenantChecklist slug={tenantSlug} /></LazyPage>}
                </Route>
              )}
              {tenantSlug && (
                <Route path="/admin">
                  {() => <LazyPage><TenantAdmin slug={tenantSlug} /></LazyPage>}
                </Route>
              )}
              {tenantSlug && (
                <Route path="/history">
                  {() => <LazyPage><TenantHistory slug={tenantSlug} /></LazyPage>}
                </Route>
              )}
              {tenantSlug && (
                <Route path="/management">
                  {() => <LazyPage><TenantManagement slug={tenantSlug} /></LazyPage>}
                </Route>
              )}

              {/* Apex root → public landing */}
              {!tenantSlug && (
                <Route path="/">
                  {() => <LazyPage><Landing /></LazyPage>}
                </Route>
              )}

              {/* Auth pages — available on apex AND tenant subdomain */}
              <Route path="/auth/login">
                {() => <LazyPage><AuthLogin /></LazyPage>}
              </Route>
              <Route path="/auth/signup">
                {() => <LazyPage><AuthSignup /></LazyPage>}
              </Route>
              <Route path="/auth/forgot-password">
                {() => <LazyPage><AuthForgotPassword /></LazyPage>}
              </Route>
              <Route path="/auth/reset">
                {() => <LazyPage><AuthResetPassword /></LazyPage>}
              </Route>
              <Route path="/auth/verify">
                {() => <LazyPage><AuthVerify /></LazyPage>}
              </Route>

              {/* Master admin — apex only */}
              {!tenantSlug && (
                <Route path="/123admin">
                  {() => <LazyPage><Admin /></LazyPage>}
                </Route>
              )}
              {!tenantSlug && (
                <Route path="/123admin/tenants/:id">
                  {(params) => <LazyPage><AdminTenant id={params.id} /></LazyPage>}
                </Route>
              )}

              {/* Legacy path-based slug — apex only, kept for transition */}
              {!tenantSlug && (
                <Route path="/:slug">
                  {(params) => <LazyPage><TenantChecklist slug={params.slug} /></LazyPage>}
                </Route>
              )}
              {!tenantSlug && (
                <Route path="/:slug/admin">
                  {(params) => <LazyPage><TenantAdmin slug={params.slug} /></LazyPage>}
                </Route>
              )}
              {!tenantSlug && (
                <Route path="/:slug/history">
                  {(params) => <LazyPage><TenantHistory slug={params.slug} /></LazyPage>}
                </Route>
              )}
              {!tenantSlug && (
                <Route path="/:slug/management">
                  {(params) => <LazyPage><TenantManagement slug={params.slug} /></LazyPage>}
                </Route>
              )}

              <Route component={NotFound} />
            </Switch>
          </main>
          <Toaster />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
