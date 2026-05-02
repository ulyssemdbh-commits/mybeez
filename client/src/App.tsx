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

function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
      <div className="text-center space-y-8 max-w-lg w-full">
        <div className="space-y-3">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <span className="text-3xl font-bold text-white">B</span>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
            myBeez
          </h1>
          <p className="text-muted-foreground text-sm">
            La plateforme de gestion pour entrepreneurs
          </p>
        </div>

        <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur rounded-2xl border p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Connectez-vous à votre espace ou accédez directement à votre activité via son URL dédiée.
          </p>
          <div className="text-xs text-muted-foreground/60">
            Format URL : <span className="font-mono text-primary">votre-entreprise</span>.mybeez-ai.com
          </div>
        </div>
      </div>
    </div>
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
              <Route path="/" component={Home} />

              <Route path="/auth/login">
                {() => <LazyPage><AuthLogin /></LazyPage>}
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
