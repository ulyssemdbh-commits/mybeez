/**
 * AnalyticsSection — UI pour le module Analytics.
 * Backend : /api/management/:slug/analytics/{dashboard,monthly,tva} (PR #85).
 *
 * Read-only dashboard agrege a la demande depuis purchases / expenses /
 * payroll / bank / cash. Trois zones :
 *
 *   1. Sélecteur de période (presets + custom range)
 *   2. Dashboard : 5 StatCards + top fournisseurs + payment status mix
 *   3. Série mensuelle : barres CSS sur 12 mois, toggle metric
 *   4. TVA : déductible (purchases + expenses). Collectée = null (V1).
 *
 * Pas de bibliothèque de charts — les graphes sont des barres CSS
 * simples avec width %. Réduit le poids du bundle, suffit pour la V1.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  Receipt,
  Banknote,
  Landmark,
  Wallet,
  TrendingUp,
  Calendar,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/management/sharedUI/StatCard";

interface DashboardResponse {
  period: { from: string; to: string };
  purchases: {
    totalTtc: number;
    totalHt: number;
    count: number;
    byStatus: Record<string, number>;
    topSuppliers: Array<{ key: string | number; total: number; count: number }>;
  };
  expenses: {
    total: number;
    count: number;
    byStatus: Record<string, number>;
  };
  payroll: {
    gross: number;
    net: number;
    employerCost: number;
    entryCount: number;
  };
  bank: {
    credits: number;
    debits: number;
    netDelta: number;
    entryCount: number;
  };
  cash: {
    totalIn: number;
    totalOut: number;
    net: number;
    entryCount: number;
  };
}

interface MonthlyPoint {
  month: string;
  purchases: number;
  expenses: number;
  payrollEmployerCost: number;
  bankCredits: number;
  bankDebits: number;
  cashIn: number;
  cashOut: number;
}

interface MonthlyResponse {
  window: { from: string; to: string };
  series: MonthlyPoint[];
}

interface TvaResponse {
  period: { from: string; to: string };
  deductible: { total: number; purchases: number; expenses: number };
  collected: number | null;
  collectedReason: string;
}

interface Props {
  tenantSlug: string;
}

function formatEUR(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatEURCents(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoFromDate(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

type Preset = "current_month" | "last_month" | "last_3_months" | "ytd" | "custom";

function presetRange(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === "current_month") {
    return { from: isoFromDate(new Date(y, m, 1)), to: isoFromDate(new Date(y, m + 1, 0)) };
  }
  if (preset === "last_month") {
    return { from: isoFromDate(new Date(y, m - 1, 1)), to: isoFromDate(new Date(y, m, 0)) };
  }
  if (preset === "last_3_months") {
    return { from: isoFromDate(new Date(y, m - 2, 1)), to: isoFromDate(new Date(y, m + 1, 0)) };
  }
  if (preset === "ytd") {
    return { from: isoFromDate(new Date(y, 0, 1)), to: todayISO() };
  }
  return { from: customFrom, to: customTo };
}

// Metrics surfaced in the monthly chart.
type MonthlyMetric = "purchases" | "expenses" | "payrollEmployerCost" | "bankCredits" | "bankDebits" | "cashIn" | "cashOut";

const METRIC_LABELS: Record<MonthlyMetric, string> = {
  purchases: "Achats",
  expenses: "Dépenses",
  payrollEmployerCost: "Coût employeur",
  bankCredits: "Crédits bancaires",
  bankDebits: "Débits bancaires",
  cashIn: "Caisse entrées",
  cashOut: "Caisse sorties",
};

const METRIC_COLORS: Record<MonthlyMetric, string> = {
  purchases: "bg-amber-500",
  expenses: "bg-orange-500",
  payrollEmployerCost: "bg-purple-500",
  bankCredits: "bg-emerald-500",
  bankDebits: "bg-red-500",
  cashIn: "bg-green-500",
  cashOut: "bg-rose-500",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  paid: "Payé",
  late: "En retard",
  cancelled: "Annulé",
  __null__: "Sans statut",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500",
  paid: "bg-emerald-500",
  late: "bg-red-500",
  cancelled: "bg-zinc-400",
  __null__: "bg-zinc-300",
};

export function AnalyticsSection({ tenantSlug }: Props) {
  const [preset, setPreset] = useState<Preset>("current_month");
  const [customFrom, setCustomFrom] = useState(() => isoFromDate(new Date(new Date().getFullYear(), 0, 1)));
  const [customTo, setCustomTo] = useState(todayISO);
  const [monthlyMetric, setMonthlyMetric] = useState<MonthlyMetric>("purchases");

  const period = useMemo(() => presetRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const dashboardQuery = useQuery<DashboardResponse>({
    queryKey: ["/api/management", tenantSlug, "analytics", "dashboard", period.from, period.to],
    queryFn: async () => {
      const p = new URLSearchParams({ from: period.from, to: period.to, topSuppliersLimit: "5" });
      const res = await fetch(`/api/management/${tenantSlug}/analytics/dashboard?${p}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const monthlyQuery = useQuery<MonthlyResponse>({
    queryKey: ["/api/management", tenantSlug, "analytics", "monthly"],
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/analytics/monthly?months=12`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const tvaQuery = useQuery<TvaResponse>({
    queryKey: ["/api/management", tenantSlug, "analytics", "tva", period.from, period.to],
    queryFn: async () => {
      const p = new URLSearchParams({ from: period.from, to: period.to });
      const res = await fetch(`/api/management/${tenantSlug}/analytics/tva?${p}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  return (
    <section className="space-y-6">
      <PeriodPicker
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        effectivePeriod={period}
      />

      <DashboardBlock query={dashboardQuery} />

      <MonthlyBlock
        query={monthlyQuery}
        metric={monthlyMetric}
        onMetricChange={setMonthlyMetric}
      />

      <TvaBlock query={tvaQuery} />
    </section>
  );
}

function PeriodPicker({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  effectivePeriod,
}: {
  preset: Preset;
  onPresetChange: (p: Preset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  effectivePeriod: { from: string; to: string };
}) {
  const presets: Array<{ value: Preset; label: string }> = [
    { value: "current_month", label: "Mois en cours" },
    { value: "last_month", label: "Mois dernier" },
    { value: "last_3_months", label: "3 derniers mois" },
    { value: "ytd", label: "Depuis le 1er janvier" },
    { value: "custom", label: "Personnalisé" },
  ];
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border p-3 flex flex-wrap items-center gap-3">
      <Calendar className="w-4 h-4 text-muted-foreground" />
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onPresetChange(p.value)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              preset === p.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800",
            )}
            data-testid={`analytics-preset-${p.value}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="px-2 py-1 text-xs rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="px-2 py-1 text-xs rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}
      <div className="ml-auto text-xs text-muted-foreground tabular-nums">
        {effectivePeriod.from} → {effectivePeriod.to}
      </div>
    </div>
  );
}

function DashboardBlock({ query }: { query: ReturnType<typeof useQuery<DashboardResponse>> }) {
  if (query.isLoading) {
    return <div className="text-sm text-muted-foreground">Chargement…</div>;
  }
  if (query.error) {
    return (
      <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
        {(query.error as Error).message}
      </div>
    );
  }
  const d = query.data!;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        <StatCard label="Achats TTC" value={formatEUR(d.purchases.totalTtc)} icon={ShoppingCart} color="amber" testId="analytics-stat-purchases" />
        <StatCard label="Dépenses" value={formatEUR(d.expenses.total)} icon={Receipt} color="amber" testId="analytics-stat-expenses" />
        <StatCard label="Coût employeur" value={formatEUR(d.payroll.employerCost)} icon={Banknote} color="purple" testId="analytics-stat-payroll" />
        <StatCard
          label="Banque net"
          value={formatEUR(d.bank.netDelta)}
          icon={Landmark}
          color={d.bank.netDelta >= 0 ? "green" : "red"}
          testId="analytics-stat-bank"
        />
        <StatCard
          label="Caisse net"
          value={formatEUR(d.cash.net)}
          icon={Wallet}
          color={d.cash.net >= 0 ? "green" : "red"}
          testId="analytics-stat-cash"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border p-4 space-y-3">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Top fournisseurs</h3>
            <span className="text-xs text-muted-foreground">par volume TTC</span>
          </header>
          {d.purchases.topSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Aucun fournisseur sur la période.</p>
          ) : (
            <div className="space-y-2">
              {(() => {
                const max = Math.max(...d.purchases.topSuppliers.map((s) => s.total));
                return d.purchases.topSuppliers.map((s) => {
                  const pct = max > 0 ? (s.total / max) * 100 : 0;
                  return (
                    <div key={String(s.key)} className="space-y-1" data-testid={`analytics-supplier-${s.key}`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">{String(s.key)}</span>
                        <span className="tabular-nums text-muted-foreground ml-2">
                          {formatEUR(s.total)} · {s.count} fact.
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${pct.toFixed(1)}%` }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border p-4 space-y-3">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Statut paiements</h3>
            <span className="text-xs text-muted-foreground">achats + dépenses</span>
          </header>
          <PaymentStatusMix
            purchases={d.purchases.byStatus}
            expenses={d.expenses.byStatus}
            purchasesCount={d.purchases.count}
            expensesCount={d.expenses.count}
          />
        </div>
      </div>
    </div>
  );
}

function PaymentStatusMix({
  purchases,
  expenses,
  purchasesCount,
  expensesCount,
}: {
  purchases: Record<string, number>;
  expenses: Record<string, number>;
  purchasesCount: number;
  expensesCount: number;
}) {
  const merged = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(purchases)) out[k] = (out[k] ?? 0) + v;
    for (const [k, v] of Object.entries(expenses)) out[k] = (out[k] ?? 0) + v;
    return out;
  }, [purchases, expenses]);
  const total = purchasesCount + expensesCount;
  if (total === 0) {
    return <p className="text-sm text-muted-foreground py-2">Aucune opération sur la période.</p>;
  }
  const entries = Object.entries(merged).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-3">
      <div className="h-3 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-800">
        {entries.map(([k, v]) => {
          const pct = (v / total) * 100;
          return (
            <div
              key={k}
              className={cn("h-full", PAYMENT_STATUS_COLORS[k] ?? "bg-zinc-400")}
              style={{ width: `${pct.toFixed(2)}%` }}
              title={`${PAYMENT_STATUS_LABELS[k] ?? k} : ${v}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className={cn("w-2.5 h-2.5 rounded-sm", PAYMENT_STATUS_COLORS[k] ?? "bg-zinc-400")} />
            <span className="text-muted-foreground">{PAYMENT_STATUS_LABELS[k] ?? k}</span>
            <span className="ml-auto tabular-nums font-medium">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyBlock({
  query,
  metric,
  onMetricChange,
}: {
  query: ReturnType<typeof useQuery<MonthlyResponse>>;
  metric: MonthlyMetric;
  onMetricChange: (m: MonthlyMetric) => void;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border p-4 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Série mensuelle — 12 derniers mois</h3>
        </div>
        <select
          value={metric}
          onChange={(e) => onMetricChange(e.target.value as MonthlyMetric)}
          className="px-2 py-1 text-xs rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid="analytics-monthly-metric"
        >
          {(Object.entries(METRIC_LABELS) as Array<[MonthlyMetric, string]>).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </header>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : query.error ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : (
        <MonthlyChart series={query.data!.series} metric={metric} />
      )}
    </div>
  );
}

function MonthlyChart({ series, metric }: { series: MonthlyPoint[]; metric: MonthlyMetric }) {
  const max = Math.max(0, ...series.map((p) => p[metric]));
  const color = METRIC_COLORS[metric];
  if (series.length === 0 || max === 0) {
    return <p className="text-sm text-muted-foreground py-4">Pas de données sur la période.</p>;
  }
  return (
    <div className="flex items-end gap-1 h-32" data-testid="analytics-monthly-chart">
      {series.map((p) => {
        const h = max > 0 ? Math.max(2, (p[metric] / max) * 100) : 0;
        return (
          <div
            key={p.month}
            className="flex-1 flex flex-col items-center gap-1"
            title={`${p.month} : ${formatEURCents(p[metric])}`}
          >
            <div className="w-full flex-1 flex items-end">
              <div className={cn("w-full rounded-t", color)} style={{ height: `${h.toFixed(1)}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {p.month.slice(5)}/{p.month.slice(2, 4)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TvaBlock({ query }: { query: ReturnType<typeof useQuery<TvaResponse>> }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">TVA</h3>
        <span className="text-xs text-muted-foreground">sur la période sélectionnée</span>
      </header>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : query.error ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-1.5">
            <div className="text-xs text-muted-foreground">TVA déductible</div>
            <div className="text-xl font-bold tabular-nums" data-testid="analytics-tva-deductible">
              {formatEURCents(query.data!.deductible.total)}
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Achats : {formatEURCents(query.data!.deductible.purchases)}</div>
              <div>Dépenses : {formatEURCents(query.data!.deductible.expenses)}</div>
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
              <Info className="w-3.5 h-3.5" />
              TVA collectée
            </div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-400">À venir</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              {query.data!.collectedReason}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
