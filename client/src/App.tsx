import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SkipLink } from "@/components/SkipLink";

const TenantChecklist = lazy(() => import("@/pages/TenantChecklist"));
const TenantAdmin = lazy(() => import("@/pages/TenantAdmin"));
const TenantHistory = lazy(() => import("@/pages/TenantHistory"));
const TenantManagement = lazy(() => import("@/pages/TenantManagement"));
const AuthLogin = lazy(() => import("@/pages/AuthLogin"));
const AuthForgotPassword = lazy(() => import("@/pages/AuthForgotPassword"));
const AuthResetPassword = lazy(() => import("@/pages/AuthResetPassword"));
const AuthVerify = lazy(() => import("@/pages/AuthVerify"));
const Landing = lazy(() => import("@/pages/Landing"));
const Admin = lazy(() => import("@/pages/Admin"));

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center" role="status">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
            <span className="text-lg font-bold text-primary">B</span>
          </div>
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
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" storageKey="mybeez-theme">
        <QueryClientProvider client={queryClient}>
          <SkipLink />
          <main id="main-content">
            <Switch>
              <Route path="/">
                {() => <LazyPage><Landing /></LazyPage>}
              </Route>

              <Route path="/auth/login">
                {() => <LazyPage><AuthLogin /></LazyPage>}
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

              <Route path="/123admin">
                {() => <LazyPage><Admin /></LazyPage>}
              </Route>

              <Route path="/:slug">
                {(params) => <LazyPage><TenantChecklist slug={params.slug} /></LazyPage>}
              </Route>
              <Route path="/:slug/admin">
                {(params) => <LazyPage><TenantAdmin slug={params.slug} /></LazyPage>}
              </Route>
              <Route path="/:slug/history">
                {(params) => <LazyPage><TenantHistory slug={params.slug} /></LazyPage>}
              </Route>
              <Route path="/:slug/management">
                {(params) => <LazyPage><TenantManagement slug={params.slug} /></LazyPage>}
              </Route>

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
