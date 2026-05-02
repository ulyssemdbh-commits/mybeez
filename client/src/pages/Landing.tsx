import {
  LayoutGrid,
  Users,
  Sparkles,
  ShieldCheck,
  Check,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: LayoutGrid,
    title: "Adapté à votre activité",
    body: "Restauration, services, retail, artisans : myBeez s'aligne sur votre vertical via des templates prêts à l'emploi (modules, vocabulaire, TVA).",
  },
  {
    icon: Users,
    title: "Comptes nominatifs et rôles fins",
    body: "Owner, Admin, Manager, Staff, Viewer — chaque membre voit ce qu'il doit voir. Audit log de tous les événements sensibles.",
  },
  {
    icon: Sparkles,
    title: "Alfred, votre copilote IA",
    body: "Un assistant intégré qui connaît votre business et répond à vos questions de gestion, en français, sans jargon.",
  },
  {
    icon: ShieldCheck,
    title: "Sécurité de niveau bancaire",
    body: "TLS Cloudflare, mots de passe Argon2id, sessions courtes, backups quotidiens chiffrés. MFA en route.",
  },
];

const planFeatures = [
  "Utilisateurs illimités",
  "Tous les modules : checklist, achats, paie, banque, caisse, analytics",
  "Alfred IA inclus",
  "Sous-domaine dédié + domaine personnalisé",
  "Backups quotidiens automatiques",
  "Support en français",
  "Sans engagement",
];

function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-lg border-b border-amber-100/60 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2" aria-label="Accueil myBeez">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm shadow-amber-500/20">
            <span className="text-base font-bold text-white">B</span>
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
            myBeez
          </span>
        </a>
        <nav className="flex items-center gap-2 sm:gap-3">
          <a
            href="#features"
            className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
          >
            Fonctionnalités
          </a>
          <a
            href="#pricing"
            className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
          >
            Tarif
          </a>
          <a
            href="/auth/login"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors px-3 py-2"
            data-testid="landing-login-link"
          >
            Se connecter
          </a>
          <a
            href="/auth/signup"
            className="text-sm font-medium bg-primary text-primary-foreground rounded-lg px-4 py-2 hover:opacity-90 transition-opacity"
            data-testid="landing-signup-cta"
          >
            S'inscrire
          </a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950" aria-hidden="true" />
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-orange-300/30 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-amber-300/20 blur-3xl" aria-hidden="true" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 dark:bg-zinc-800/80 border border-amber-200/70 dark:border-zinc-700 text-xs font-medium text-amber-700 dark:text-amber-300">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Disponible en France et en Belgique
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
          La plateforme de gestion qui fait{" "}
          <span className="bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
            travailler votre business
          </span>{" "}
          pour vous.
        </h1>

        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Pilotez votre activité avec la simplicité d'une ruche bien organisée. Pro, ergonomique et performant — sans jamais oublier d'être humain.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/auth/signup"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-6 py-3 text-base font-semibold shadow-lg shadow-amber-500/25 hover:opacity-90 transition-opacity"
            data-testid="hero-signup-cta"
          >
            Commencer maintenant
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="/auth/login"
            className="inline-flex items-center gap-2 bg-white/80 dark:bg-zinc-800/80 backdrop-blur border rounded-xl px-6 py-3 text-base font-medium hover:bg-white dark:hover:bg-zinc-800 transition-colors"
          >
            J'ai déjà un compte
          </a>
        </div>

        <p className="text-xs text-muted-foreground">Sans carte bancaire pour démarrer · Annulable à tout moment</p>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="bg-white dark:bg-zinc-950 py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold">Tout ce dont une équipe a besoin pour avancer</h2>
          <p className="text-muted-foreground">Un seul outil pour aligner vos équipes, suivre vos opérations, et garder une vue claire sur votre activité au quotidien.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border bg-card p-6 hover:shadow-md hover:shadow-amber-500/5 transition-shadow"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 shadow-sm shadow-amber-500/20">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-zinc-900 dark:to-zinc-950 py-20 sm:py-28">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-10">
        <div className="text-center space-y-4">
          <h2 className="text-3xl sm:text-4xl font-bold">Un tarif. Tout inclus.</h2>
          <p className="text-muted-foreground">Pas de plan compliqué, pas de tier piégeux. Vous payez un prix unique, vous avez tout.</p>
        </div>

        <div className="rounded-3xl border-2 border-amber-300/70 dark:border-amber-500/40 bg-white dark:bg-zinc-900 p-8 sm:p-10 shadow-xl shadow-amber-500/10">
          <div className="text-center space-y-2 pb-8 border-b">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Plan unique</p>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-5xl font-bold">99 €</span>
              <span className="text-muted-foreground">HT / mois</span>
            </div>
            <p className="text-sm text-muted-foreground">par espace de travail</p>
          </div>

          <ul className="py-8 space-y-3">
            {planFeatures.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                </div>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <a
            href="/auth/signup"
            className="block w-full text-center bg-primary text-primary-foreground rounded-xl px-6 py-3 text-base font-semibold shadow-lg shadow-amber-500/25 hover:opacity-90 transition-opacity"
            data-testid="pricing-signup-cta"
          >
            Commencer maintenant
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-white dark:bg-zinc-950 border-t border-amber-100/60 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid sm:grid-cols-3 gap-8 items-start">
        <div className="space-y-3">
          <a href="/" className="flex items-center gap-2" aria-label="Accueil myBeez">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm shadow-amber-500/20">
              <span className="text-base font-bold text-white">B</span>
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
              myBeez
            </span>
          </a>
          <p className="text-sm text-muted-foreground max-w-xs">
            Les abeilles font le miel. Vous faites le business.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Produit</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><a href="#features" className="hover:text-foreground transition-colors">Fonctionnalités</a></li>
            <li><a href="#pricing" className="hover:text-foreground transition-colors">Tarif</a></li>
            <li><a href="/auth/login" className="hover:text-foreground transition-colors">Se connecter</a></li>
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Contact</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <a href="mailto:contact@mybeez-ai.com" className="hover:text-foreground transition-colors">
                contact@mybeez-ai.com
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-amber-100/60 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} myBeez. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}
