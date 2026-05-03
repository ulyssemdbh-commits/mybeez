import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Menu,
  X,
  Star,
  Bot,
  ShieldCheck,
  LayoutGrid,
  Users,
  Sparkles,
  Building2,
  Store,
  Briefcase,
  ListChecks,
  Wallet,
  KeyRound,
  Database,
  Globe,
  Clock,
  TrendingUp,
} from "lucide-react";

// ============================== Mock browser shell ==============================

function MockBrowser({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-card shadow-2xl ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
          <div className="w-3 h-3 rounded-full bg-green-400/80" />
        </div>
        <div className="flex-1 mx-2">
          <div className="bg-white/60 dark:bg-zinc-900/60 rounded-md px-3 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 text-center truncate">
            {title}
          </div>
        </div>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

// ============================== Mockups (HTML "screenshots") ==============================

function MockTenantDashboard() {
  return (
    <MockBrowser title="valentine.mybeez-ai.com" className="w-full max-w-2xl">
      <div className="bg-gradient-to-br from-amber-50 to-orange-50/30 dark:from-zinc-950 dark:to-amber-950/20 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-bold">Valentine — Tableau de bord</h3>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-medium">Pro</span>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: "Aujourd'hui", value: "23", icon: ListChecks, color: "text-blue-500" },
            { label: "En cours", value: "4", icon: Clock, color: "text-amber-500" },
            { label: "Ce mois", value: "542", icon: TrendingUp, color: "text-emerald-500" },
            { label: "CA", value: "32.1k", icon: Wallet, color: "text-purple-500" },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-zinc-900 rounded-lg p-2.5 border border-zinc-200 dark:border-zinc-800 text-center">
              <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
              <p className="text-base font-bold">{s.value}</p>
              <p className="text-[9px] text-zinc-500 dark:text-zinc-400">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-semibold">Checklist du jour</span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">19 / 23 fait</span>
          </div>
          {[
            { label: "Vérifier les stocks de viande", who: "Cuisine", done: true },
            { label: "Nettoyer la zone de prép", who: "Cuisine", done: true },
            { label: "Compter la caisse", who: "Comptoir", done: false },
          ].map((t, i) => (
            <div key={i} className="px-3 py-2 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
              <div className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${t.done ? "bg-emerald-500 border-emerald-500" : "border-zinc-300 dark:border-zinc-700"}`}>
                {t.done && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className={`text-xs flex-1 ${t.done ? "text-zinc-400 line-through" : ""}`}>{t.label}</span>
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{t.who}</span>
            </div>
          ))}
        </div>
      </div>
    </MockBrowser>
  );
}

function MockMyBusiness() {
  return (
    <MockBrowser title="valentine.mybeez-ai.com/management" className="w-full max-w-xl">
      <div className="bg-gradient-to-br from-[#0a0a12] to-[#12121f] p-4">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {["Achats", "Frais", "Banque", "Caisse", "RH"].map((tab, i) => (
            <span key={tab} className={`px-2.5 py-1 rounded-md text-[10px] font-medium ${i === 0 ? "bg-amber-500 text-white" : "text-white/50 bg-white/5"}`}>
              {tab}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "CA mensuel", value: "32 100 €", trend: "+12%", color: "from-emerald-500/20 to-emerald-500/5" },
            { label: "Charges", value: "21 050 €", trend: "-3%", color: "from-red-500/20 to-red-500/5" },
            { label: "Marge nette", value: "11 050 €", trend: "+24%", color: "from-blue-500/20 to-blue-500/5" },
          ].map((s) => (
            <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-lg p-3 border border-white/10`}>
              <p className="text-[9px] text-white/50 mb-1">{s.label}</p>
              <p className="text-sm font-bold text-white">{s.value}</p>
              <p className="text-[10px] text-emerald-400">{s.trend}</p>
            </div>
          ))}
        </div>
        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] text-white/70 font-medium">Gestion RH — 6 employés actifs</span>
          </div>
          <div className="space-y-1.5">
            {[
              { name: "Sophie M.", role: "Cuisine", status: "CDI" },
              { name: "Karim B.", role: "Service", status: "CDI" },
              { name: "Léa K.", role: "Caisse", status: "CDD" },
            ].map((emp) => (
              <div key={emp.name} className="flex items-center justify-between">
                <span className="text-[10px] text-white/60">{emp.name} · {emp.role}</span>
                <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{emp.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockBrowser>
  );
}

function MockAlfred() {
  return (
    <div className="w-full max-w-sm">
      <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-card shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <span className="text-sm font-semibold">Alfred</span>
              <span className="text-[10px] border border-white/40 text-white/80 px-1.5 py-0.5 rounded-full">IA</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-white/70">En ligne</span>
            </div>
          </div>
        </div>
        <div className="p-3 space-y-3 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex gap-2 justify-end">
            <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-xs max-w-[75%]">
              Combien d'heures Sophie a-t-elle faites cette semaine ?
            </div>
          </div>
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-card border shadow-sm rounded-lg px-3 py-2 text-xs max-w-[80%]">
              <span className="font-bold text-emerald-600 dark:text-emerald-400">38h30</span> sur 5 jours. Pas d'heures sup à régler.
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-xs max-w-[75%]">
              Mes achats fournisseurs ont-ils dérapé ce mois ?
            </div>
          </div>
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-card border shadow-sm rounded-lg px-3 py-2 text-xs max-w-[80%]">
              <span className="text-amber-600 dark:text-amber-400 font-medium">Oui :</span> "BioFresh" est en hausse de +35% vs mois dernier. Je recommande de renégocier ou de comparer 2-3 alternatives.
            </div>
          </div>
        </div>
        <div className="p-2 border-t bg-background flex gap-2">
          <div className="flex-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-md px-3 py-1.5 text-xs text-zinc-500">Posez votre question…</div>
          <div className="w-8 h-8 rounded-md bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-center">
            <ArrowRight className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MockTablet() {
  return (
    <div className="w-[260px] mx-auto">
      <div className="rounded-[24px] border-[3px] border-zinc-700 bg-zinc-950 overflow-hidden shadow-2xl">
        <div className="bg-zinc-950 px-6 pt-2 pb-1 flex justify-center">
          <div className="w-20 h-5 bg-zinc-900 rounded-full" />
        </div>
        <div className="bg-gradient-to-b from-amber-950 to-zinc-950 px-3 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-semibold text-xs">Checklist Cuisine</span>
            <span className="text-[10px] text-amber-400">7 / 10</span>
          </div>
          <div className="space-y-1.5 mb-2">
            {[
              { label: "Frigo poisson < 4°C", done: true },
              { label: "Plonge propre", done: true },
              { label: "Stocks viande comptés", done: true },
              { label: "Mise en place légumes", done: false },
              { label: "Sauce du jour testée", done: false },
            ].map((it, i) => (
              <div key={i} className="flex items-center gap-2 bg-white/5 rounded-md px-2 py-1.5 border border-white/10">
                <div className={`w-3.5 h-3.5 rounded-sm flex-shrink-0 flex items-center justify-center ${it.done ? "bg-emerald-500" : "border border-white/20"}`}>
                  {it.done && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className={`text-[10px] ${it.done ? "text-white/40 line-through" : "text-white"}`}>{it.label}</span>
              </div>
            ))}
          </div>
          <div className="bg-amber-500 rounded-md py-1.5 text-center">
            <span className="text-white text-[10px] font-semibold">Valider ma checklist</span>
          </div>
        </div>
        <div className="bg-zinc-950 h-4 flex justify-center items-end pb-1">
          <div className="w-16 h-1 bg-zinc-700 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ============================== Sections ==============================

const FEATURES_CHECKS = {
  multivertical: [
    "14 templates prêts à l'emploi (restauration, services, retail…)",
    "Modules activés et vocabulaire adaptés à votre métier",
    "Sous-domaine dédié : votre-entreprise.mybeez-ai.com",
    "Domaine personnalisé en option",
  ],
  rbac: [
    "Comptes nominatifs (email + mot de passe argon2id)",
    "5 rôles : Owner, Admin, Manager, Staff, Viewer",
    "Audit log des actions sensibles",
    "MFA TOTP en route, Passkeys/SSO en phase 2",
  ],
  modules: [
    "Checklist quotidienne avec assignation par poste",
    "Achats fournisseurs et frais généraux",
    "Banque et rapprochement, caisse",
    "Employés, paie, absences",
    "Analytics et rapports mensuels",
  ],
  alfred: [
    "Posez vos questions en langage naturel, en français",
    "Connaît votre activité : achats, frais, équipes, planning",
    "Détecte les dérapages et propose des actions",
    "Disponible 24h/24, à côté de votre tableau de bord",
  ],
  security: [
    "TLS via Cloudflare, mots de passe Argon2id",
    "Sessions courtes, déconnexion à distance",
    "Backups Postgres quotidiens chiffrés (R2)",
    "Isolation stricte des données par tenant",
  ],
};

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-lg border-b border-amber-100/60 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2" aria-label="Accueil myBeez">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm shadow-amber-500/20">
            <span className="text-base font-bold text-white">B</span>
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
            myBeez
          </span>
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-600 dark:text-zinc-300">
          <a href="#verticales" className="hover:text-foreground transition-colors">Pour qui ?</a>
          <a href="#features" className="hover:text-foreground transition-colors">Fonctionnalités</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Tarif</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <a href="/auth/login" className="text-sm font-medium px-3 py-2 hover:text-primary transition-colors">
            Se connecter
          </a>
          <a
            href="/auth/signup"
            className="inline-flex items-center gap-1 text-sm font-medium bg-primary text-primary-foreground rounded-lg px-4 py-2 hover:opacity-90 transition-opacity"
          >
            S'inscrire
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
        <button className="md:hidden p-2" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t bg-background px-4 py-4 space-y-3">
          {["#verticales", "#features", "#pricing", "#faq"].map((href, i) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block text-sm text-muted-foreground hover:text-foreground"
            >
              {["Pour qui ?", "Fonctionnalités", "Tarif", "FAQ"][i]}
            </a>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <a href="/auth/login" className="block text-center text-sm font-medium border rounded-lg px-4 py-2">
              Se connecter
            </a>
            <a href="/auth/signup" className="block text-center text-sm font-medium bg-primary text-primary-foreground rounded-lg px-4 py-2">
              S'inscrire
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950" aria-hidden="true" />
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-orange-300/30 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-amber-300/20 blur-3xl" aria-hidden="true" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="max-w-xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 dark:bg-zinc-800/80 border border-amber-200/70 dark:border-zinc-700 text-xs font-medium text-amber-700 dark:text-amber-300">
              <Sparkles className="w-3 h-3" />
              Disponible en France et en Belgique
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight">
              Votre business,{" "}
              <span className="bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
                organisé comme une ruche
              </span>{" "}
              qui fonctionne.
            </h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-300 leading-relaxed">
              myBeez est la plateforme tout-en-un pour piloter votre activité au quotidien : checklist, équipes, achats, finance, IA — sans assembler 5 outils différents.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="/auth/signup"
                className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl px-6 py-3 text-base font-semibold shadow-lg shadow-amber-500/25 hover:opacity-90 transition-opacity"
              >
                Commencer
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="/auth/login"
                className="inline-flex items-center justify-center gap-2 bg-white/80 dark:bg-zinc-800/80 backdrop-blur border rounded-xl px-6 py-3 text-base font-medium hover:bg-white dark:hover:bg-zinc-800 transition-colors"
              >
                J'ai déjà un compte
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Sans carte bancaire</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Sans engagement</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> En ligne en 5 min</span>
            </div>
          </div>
          <div className="hidden lg:block">
            <MockTenantDashboard />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSolution() {
  return (
    <section className="bg-zinc-50 dark:bg-zinc-900/40 border-y border-zinc-200 dark:border-zinc-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold">Un seul outil, une seule équipe, une seule facture.</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Arrêtez de jongler entre une appli de checklist, un tableur RH, une compta en PDF et trois mots de passe différents.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                <X className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="font-semibold">Sans myBeez</h3>
            </div>
            <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
              {[
                "3 à 5 logiciels qui ne se parlent pas",
                "Données partout, partout différentes",
                "Pas de visibilité globale sur l'activité",
                "Onboarding équipe : 1 demi-journée par personne",
              ].map((it) => (
                <li key={it} className="flex items-start gap-2">
                  <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  {it}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="font-semibold">Avec myBeez</h3>
            </div>
            <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
              {[
                "Une seule plateforme, une seule connexion",
                "Vos équipes, vos achats, votre finance — au même endroit",
                "Vue 360° en temps réel",
                "Onboarding nouveau collaborateur : 5 minutes",
              ].map((it) => (
                <li key={it} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  {it}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureRow({
  label,
  labelIcon: LabelIcon,
  labelColor,
  title,
  description,
  checks,
  visual,
  reversed = false,
}: {
  label: string;
  labelIcon: React.ComponentType<{ className?: string }>;
  labelColor: string;
  title: string;
  description: string;
  checks: string[];
  visual: ReactNode;
  reversed?: boolean;
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-12 items-center">
      <div className={reversed ? "lg:order-2" : ""}>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${labelColor.replace("text-", "bg-").replace(/-(\d+)$/, "-500/10")}`}>
            <LabelIcon className={`w-4 h-4 ${labelColor}`} />
          </div>
          <span className={`text-xs font-semibold uppercase tracking-wider ${labelColor}`}>{label}</span>
        </div>
        <h3 className="text-2xl md:text-3xl font-bold mb-4">{title}</h3>
        <p className="text-zinc-600 dark:text-zinc-300 mb-6 leading-relaxed">{description}</p>
        <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
          {checks.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
              {c}
            </li>
          ))}
        </ul>
      </div>
      <div className={`flex justify-center ${reversed ? "lg:order-1" : ""}`}>{visual}</div>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="bg-white dark:bg-zinc-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24 space-y-24">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-medium">
            <ShieldCheck className="w-3 h-3" />
            Tout-en-un
          </span>
          <h2 className="text-3xl md:text-4xl font-bold">Pensé pour les équipes qui font tourner la boutique.</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-300">
            Cinq capacités qui se complètent au lieu de se chevaucher. Aucune option à débloquer, aucune surprise.
          </p>
        </div>

        <FeatureRow
          label="Multi-activités"
          labelIcon={LayoutGrid}
          labelColor="text-orange-500"
          title="Adapté à votre vertical, pas à un cas générique."
          description="À l'inscription, vous choisissez votre activité (restauration, salon, garage, boutique…). myBeez se configure tout seul avec les modules, les catégories et le vocabulaire de votre métier."
          checks={FEATURES_CHECKS.multivertical}
          visual={<MockTablet />}
        />

        <FeatureRow
          reversed
          label="Comptes & Rôles"
          labelIcon={KeyRound}
          labelColor="text-blue-500"
          title="Comptes nominatifs et permissions fines."
          description="Chaque membre de votre équipe a son propre compte sécurisé. Vous décidez précisément ce qu'il voit et ce qu'il peut modifier."
          checks={FEATURES_CHECKS.rbac}
          visual={
            <MockBrowser title="valentine.mybeez-ai.com/admin/users" className="w-full max-w-md">
              <div className="bg-white dark:bg-zinc-900 p-4 space-y-2">
                {[
                  { email: "owner@valentine.fr", role: "Owner", color: "bg-amber-500" },
                  { email: "sophie@valentine.fr", role: "Admin", color: "bg-blue-500" },
                  { email: "karim@valentine.fr", role: "Manager", color: "bg-purple-500" },
                  { email: "lea@valentine.fr", role: "Staff", color: "bg-zinc-500" },
                ].map((m) => (
                  <div key={m.email} className="flex items-center justify-between border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2">
                    <span className="text-xs">{m.email}</span>
                    <span className={`text-[10px] text-white px-2 py-0.5 rounded-md ${m.color}`}>{m.role}</span>
                  </div>
                ))}
              </div>
            </MockBrowser>
          }
        />

        <FeatureRow
          label="Modules métier"
          labelIcon={Briefcase}
          labelColor="text-purple-500"
          title="Comptabilité, RH, achats, caisse — natifs."
          description="Pas besoin d'un logiciel séparé pour la paie ou les fournisseurs. Tout vit dans myBeez, partage les mêmes utilisateurs et le même vocabulaire."
          checks={FEATURES_CHECKS.modules}
          visual={<MockMyBusiness />}
        />

        <FeatureRow
          reversed
          label="Alfred — Assistant IA"
          labelIcon={Sparkles}
          labelColor="text-amber-500"
          title="Une IA qui connaît VOTRE business."
          description="Alfred a accès à vos données (achats, frais, équipes, planning) et répond à vos questions en français, sans jargon. Détecte les anomalies avant que ça coûte cher."
          checks={FEATURES_CHECKS.alfred}
          visual={<MockAlfred />}
        />

        <FeatureRow
          label="Sécurité"
          labelIcon={ShieldCheck}
          labelColor="text-emerald-500"
          title="Sécurité de niveau bancaire, sans complexité."
          description="Vos données sont chiffrées en transit et au repos, vos sauvegardes partent quotidiennement vers un stockage objet redondant chez Cloudflare."
          checks={FEATURES_CHECKS.security}
          visual={
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {[
                { icon: ShieldCheck, label: "TLS Cloudflare", color: "text-emerald-600" },
                { icon: KeyRound, label: "Argon2id", color: "text-blue-600" },
                { icon: Database, label: "Backups R2", color: "text-purple-600" },
                { icon: Globe, label: "Custom domain", color: "text-amber-600" },
              ].map((f) => (
                <div key={f.label} className="bg-white dark:bg-zinc-900 border rounded-2xl p-5 text-center space-y-2 shadow-sm">
                  <f.icon className={`w-7 h-7 mx-auto ${f.color}`} />
                  <p className="text-sm font-medium">{f.label}</p>
                </div>
              ))}
            </div>
          }
        />
      </div>
    </section>
  );
}

function StatsBar() {
  return (
    <section className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 text-center">
          {[
            { value: "5 min", label: "Mise en route" },
            { value: "14", label: "Verticales prêtes" },
            { value: "5 rôles", label: "Permissions fines" },
            { value: "24/7", label: "Alfred disponible" },
            { value: "99 €", label: "HT / mois, tout inclus" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl md:text-4xl font-extrabold mb-1">{s.value}</p>
              <p className="text-sm opacity-90">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Verticales() {
  const groups = [
    {
      icon: Store,
      title: "Commerce de bouche",
      items: ["Restaurant", "Café-bar", "Boulangerie-pâtisserie", "Traiteur", "Foodtruck"],
      color: "from-amber-500 to-orange-500",
    },
    {
      icon: Briefcase,
      title: "Entreprise de services",
      items: ["Salon de coiffure", "Garage automobile", "Cabinet conseil", "Services à domicile"],
      color: "from-blue-500 to-cyan-500",
    },
    {
      icon: Building2,
      title: "Retail B2C",
      items: ["Boutique de quartier", "Épicerie fine", "Concept store", "Magasin spécialisé"],
      color: "from-purple-500 to-pink-500",
    },
  ];
  return (
    <section id="verticales" className="bg-zinc-50 dark:bg-zinc-900/40 border-y border-zinc-200 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold">Pour qui ?</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-300">
            myBeez s'adapte à votre activité grâce à des templates prêts à l'emploi. La plateforme reste la même, votre vocabulaire suit.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {groups.map((g) => (
            <div key={g.title} className="bg-white dark:bg-zinc-900 border rounded-2xl p-6 space-y-4">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${g.color} flex items-center justify-center shadow-sm`}>
                <g.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold">{g.title}</h3>
              <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                {g.items.map((i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-8">
          Votre activité n'est pas listée ? <a href="mailto:contact@mybeez-ai.com" className="text-primary hover:underline">Écrivez-nous</a> — on ajoute votre vertical en 24h.
        </p>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="bg-white dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-24 space-y-10">
        <div className="text-center space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold">Un tarif. Tout inclus.</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-300">
            Pas de plan compliqué, pas de tier piégeux. Vous payez un prix unique, vous avez tout.
          </p>
        </div>
        <div className="rounded-3xl border-2 border-amber-300/70 dark:border-amber-500/40 bg-white dark:bg-zinc-900 p-8 sm:p-10 shadow-xl shadow-amber-500/10 relative">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
            <Star className="w-3 h-3" /> Tout inclus
          </span>
          <div className="text-center space-y-2 pb-8 border-b">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Plan unique</p>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-5xl font-bold">99 €</span>
              <span className="text-zinc-500">HT / mois</span>
            </div>
            <p className="text-sm text-zinc-500">par espace de travail · sans engagement</p>
          </div>
          <ul className="py-8 grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {[
              "Utilisateurs illimités",
              "Tous les modules : checklist, achats, paie…",
              "Alfred IA inclus",
              "Sous-domaine + domaine personnalisé",
              "Backups quotidiens automatiques",
              "Support en français",
              "Conforme RGPD, données en UE",
              "Mises à jour incluses",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
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
          >
            Commencer
          </a>
        </div>
      </div>
    </section>
  );
}

function FAQItem({ q, a, id }: { q: string; a: string; id: string }) {
  const [open, setOpen] = useState(false);
  const panelId = `faq-panel-${id}`;
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="text-sm font-medium pr-4">{q}</span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div id={panelId} role="region" className="px-5 pb-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{a}</div>}
    </div>
  );
}

function FAQ() {
  const items = [
    {
      id: "vertical",
      q: "Mon activité n'est pas listée. Vous m'aidez quand même ?",
      a: "Oui. Si votre métier ne figure pas dans nos 14 templates initiaux, écrivez-nous : on ajoute votre vertical en 24 à 48h. Pas de surcoût.",
    },
    {
      id: "engagement",
      q: "Y a-t-il un engagement ?",
      a: "Aucun. Vous arrêtez quand vous voulez, vous récupérez vos données, on supprime les nôtres.",
    },
    {
      id: "essai",
      q: "Comment démarrer ?",
      a: "Vous créez votre espace en 5 minutes : email, mot de passe, choix de votre activité. Sans carte bancaire pour démarrer.",
    },
    {
      id: "equipe",
      q: "Combien d'utilisateurs puis-je créer ?",
      a: "Illimité. Le tarif unique de 99 € HT/mois inclut tous vos collaborateurs, quelle que soit la taille de l'équipe.",
    },
    {
      id: "donnees",
      q: "Où sont stockées mes données ?",
      a: "En Europe, sur infrastructure Hetzner (Allemagne) avec backups quotidiens chiffrés sur Cloudflare R2. Conforme RGPD.",
    },
    {
      id: "alfred",
      q: "Comment fonctionne Alfred ?",
      a: "Alfred est un assistant IA intégré qui a accès à VOS données (achats, frais, équipes, planning) et répond à vos questions en français. Il détecte les anomalies — par exemple un fournisseur dont les prix ont dérapé — et propose des actions.",
    },
    {
      id: "domaine",
      q: "Puis-je avoir mon propre nom de domaine ?",
      a: "Oui. Par défaut votre espace est sur votre-entreprise.mybeez-ai.com. Vous pouvez ajouter votre domaine personnalisé à tout moment, on s'occupe de la configuration TLS.",
    },
    {
      id: "securite",
      q: "Mes données sont-elles vraiment isolées des autres clients ?",
      a: "Oui. Chaque tenant a un identifiant qui filtre automatiquement toutes les requêtes côté serveur. Aucun risque de fuite trans-tenant.",
    },
    {
      id: "support",
      q: "Comment vous joindre ?",
      a: "Par email à contact@mybeez-ai.com. Réponse sous 24h ouvrées, plus rapidement aux heures d'ouverture (9h-19h, semaine).",
    },
  ];
  return (
    <section id="faq" className="bg-zinc-50 dark:bg-zinc-900/40 border-y border-zinc-200 dark:border-zinc-800">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-24 space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold">Questions fréquentes</h2>
        </div>
        <div className="space-y-3">
          {items.map((it) => (
            <FAQItem key={it.id} {...it} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 md:py-20 text-center space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold">Prêt à reprendre le contrôle de votre business ?</h2>
        <p className="text-lg opacity-90 max-w-xl mx-auto">
          Créez votre espace en 5 minutes. Sans carte bancaire, sans engagement.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/auth/signup"
            className="inline-flex items-center gap-2 bg-white text-amber-700 rounded-xl px-6 py-3 text-base font-semibold hover:bg-amber-50 transition-colors"
          >
            Commencer
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="/auth/login"
            className="inline-flex items-center gap-2 bg-white/10 text-white border border-white/30 rounded-xl px-6 py-3 text-base font-medium hover:bg-white/20 transition-colors"
          >
            J'ai déjà un compte
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-white dark:bg-zinc-950 border-t border-amber-100/60 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div className="sm:col-span-2 md:col-span-1 space-y-3">
            <a href="/" className="flex items-center gap-2" aria-label="Accueil myBeez">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm shadow-amber-500/20">
                <span className="text-base font-bold text-white">B</span>
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
                myBeez
              </span>
            </a>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-xs leading-relaxed">
              Les abeilles font le miel. Vous faites le business. myBeez fait le reste.
            </p>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Produit</h4>
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li><a href="#verticales" className="hover:text-foreground transition-colors">Pour qui ?</a></li>
              <li><a href="#features" className="hover:text-foreground transition-colors">Fonctionnalités</a></li>
              <li><a href="#pricing" className="hover:text-foreground transition-colors">Tarif</a></li>
              <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Compte</h4>
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li><a href="/auth/signup" className="hover:text-foreground transition-colors">Créer un compte</a></li>
              <li><a href="/auth/login" className="hover:text-foreground transition-colors">Se connecter</a></li>
              <li><a href="/auth/forgot-password" className="hover:text-foreground transition-colors">Mot de passe oublié</a></li>
            </ul>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Contact</h4>
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li><a href="mailto:contact@mybeez-ai.com" className="hover:text-foreground transition-colors">contact@mybeez-ai.com</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6 text-xs text-zinc-500 dark:text-zinc-400 text-center">
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
        <ProblemSolution />
        <Features />
        <StatsBar />
        <Verticales />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
