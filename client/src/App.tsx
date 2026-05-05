import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SkipLink } from "@/components/SkipLink";
import { Logo } from "@/components/Logo";
import { getTenantSlugFromHost } from "@/lib/tenantHost";

const TenantChecklist = lazy(() => import("@/pages/TenantChecklist"));
const TenantAdmin = lazy(() => import("@/pages/TenantAdmin"));
const TenantHistory = lazy(() => import("@/pages/TenantHistory"));
const TenantManagement = lazy(() => import("@/pages/TenantManagement"));
const AuthLogin = lazy(() => import("@/pages/AuthLogin"));
const AuthSignup = lazy(() => import("@/pages/AuthSignup"));
const AuthForgotPassword = lazy(() => import("@/pages/AuthForgotPassword"));
const AuthResetPassword = lazy(() => import("@/pages/AuthResetPassword"));
const AuthVerify = lazy(() => import("@/pages/AuthVerify"));
const AuthSecurity = lazy(() => import("@/pages/AuthSecurity"));
const Landing = lazy(() => import("@/pages/Landing"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminTenant = lazy(() => import("@/pages/AdminTenant"));

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
                  {() => <LazyPage><TenantManagement slug={tenantSlug} isSubdomain={true} /></LazyPage>}
                </Route>
              )}
              {tenantSlug && (
                <Route path="/management/:section">
                  {(params) => <LazyPage><TenantManagement slug={tenantSlug} section={params.section} isSubdomain={true} /></LazyPage>}
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
              <Route path="/auth/security">
                {() => <LazyPage><AuthSecurity /></LazyPage>}
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
                  {(params) => <LazyPage><TenantManagement slug={params.slug} isSubdomain={false} /></LazyPage>}
                </Route>
              )}
              {!tenantSlug && (
                <Route path="/:slug/management/:section">
                  {(params) => <LazyPage><TenantManagement slug={params.slug} section={params.section} isSubdomain={false} /></LazyPage>}
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
