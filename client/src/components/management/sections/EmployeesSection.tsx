/**
 * EmployeesSection — page Gestion RH (Sprint 4 V2 UI, PR #75).
 *
 * Backend : routes `/api/management/:slug/{employees,payroll,absences}`
 * livrées en PR #72. La capture utilisateur 2026-05-08 sert de cible
 * UX : header stats (effectif, fiches, alertes, masse salariale) +
 * liste employés + détail employé avec sections Absences / Fiches de
 * paie / Documents RH.
 *
 * Patterns réutilisés depuis ulysseclaude `GestionRHTab.tsx` :
 *   - StatCard 4 colonnes
 *   - filtre actif / tous
 *   - liste avec expand inline (au lieu d'un panneau séparé)
 *
 * Adaptations myBeez :
 *   - sharedUI.StatCard / CollapsibleCard (PR #63)
 *   - palette amber
 *   - dark-mode auto via classes Tailwind
 *   - vertical-agnostic (pas de catégories restaurant hardcodées)
 *
 * Hors scope V1 (V2 PR follow-up) :
 *   - Upload PDF bulletin (POST /payroll/import-pdf) avec parsing OCR
 *   - Reparser PDF (POST /payroll/reparse-all)
 *   - Send-email-bulk fiches
 *   - Filtres temporels Année/Trimestre/Mois (V1 = period mois en cours
 *     pour le summary uniquement, pas de filtrage côté liste)
 *   - Export CSV
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  FileText,
  AlertCircle,
  Wallet,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  CalendarOff,
  Banknote,
  FolderOpen,
  Loader2,
  Download,
  Check,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/management/sharedUI";
import { EmployeeFormDialog } from "./employees/EmployeeFormDialog";
import { PayslipFormDialog } from "./employees/PayslipFormDialog";
import { AbsenceFormDialog } from "./employees/AbsenceFormDialog";
import type { Employee, Payroll, Absence, FileRow, EmployeeSummary } from "./employees/types";

interface Props {
  tenantSlug: string;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatEUR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  // accepte YYYY-MM-DD ou YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-");
    return `${m}/${y}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}

const ABSENCE_TYPE_LABELS: Record<string, string> = {
  conge: "Congé",
  maladie: "Maladie",
  retard: "Retard",
  absence: "Absence",
  formation: "Formation",
};

export function EmployeesSection({ tenantSlug }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const apiBase = `/api/management/${tenantSlug}`;

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [period, setPeriod] = useState<string>(currentMonth());
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [creatingEmployee, setCreatingEmployee] = useState(false);

  // -- Data --
  const employeesQuery = useQuery<{ employees: Employee[] }>({
    queryKey: [`${apiBase}/employees`, { activeOnly }],
    queryFn: async () => {
      const url = activeOnly ? `${apiBase}/employees?activeOnly=true` : `${apiBase}/employees`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Erreur chargement employés");
      return r.json();
    },
  });

  const summaryQuery = useQuery<EmployeeSummary>({
    queryKey: [`${apiBase}/employees/summary`, { period }],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/employees/summary?period=${period}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Erreur chargement stats");
      return r.json();
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${apiBase}/employees/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erreur suppression");
    },
    onSuccess: () => {
      toast({ title: "Employé archivé" });
      qc.invalidateQueries({ queryKey: [`${apiBase}/employees`] });
      qc.invalidateQueries({ queryKey: [`${apiBase}/employees/summary`] });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const employees = employeesQuery.data?.employees ?? [];
  const filtered = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase().trim();
    return employees.filter((e) => {
      const name = `${e.firstName} ${e.lastName}`.toLowerCase();
      return name.includes(q) || (e.position ?? "").toLowerCase().includes(q);
    });
  }, [employees, search]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header stats */}
      <StatsHeader summary={summaryQuery.data} loading={summaryQuery.isLoading} period={period} setPeriod={setPeriod} />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Rechercher (nom, poste...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 w-full rounded-lg border bg-white dark:bg-zinc-800 dark:border-zinc-700 text-sm"
              data-testid="input-search-employees"
            />
          </div>
          <label className="flex items-center gap-2 text-sm shrink-0">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="rounded"
            />
            Actifs seulement
          </label>
        </div>
        <button
          type="button"
          onClick={() => setCreatingEmployee(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
          data-testid="btn-new-employee"
        >
          <Plus className="w-4 h-4" />
          Nouvel employé
        </button>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-zinc-900 border rounded-2xl shadow-sm">
        {employeesQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {employees.length === 0
              ? "Aucun employé créé. Cliquez sur « Nouvel employé » pour commencer."
              : "Aucun employé ne correspond à la recherche."}
          </div>
        ) : (
          <ul className="divide-y dark:divide-zinc-800">
            {filtered.map((e) => (
              <EmployeeRow
                key={e.id}
                employee={e}
                expanded={expandedId === e.id}
                onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
                onEdit={() => setEditingEmployee(e)}
                onArchive={() => {
                  if (confirm(`Archiver ${e.firstName} ${e.lastName} ?`)) {
                    deleteEmployee.mutate(e.id);
                  }
                }}
                tenantSlug={tenantSlug}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Dialogs */}
      {creatingEmployee && (
        <EmployeeFormDialog
          tenantSlug={tenantSlug}
          mode="create"
          onClose={() => setCreatingEmployee(false)}
        />
      )}
      {editingEmployee && (
        <EmployeeFormDialog
          tenantSlug={tenantSlug}
          mode="edit"
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
        />
      )}
    </div>
  );
}

// =================== Stats header ===================

function StatsHeader({
  summary,
  loading,
  period,
  setPeriod,
}: {
  summary: EmployeeSummary | undefined;
  loading: boolean;
  period: string;
  setPeriod: (s: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Synthèse — {formatDate(period)}
        </h2>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-2 py-1 rounded-lg border bg-white dark:bg-zinc-800 dark:border-zinc-700 text-xs"
          data-testid="input-period-month"
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
          label="Effectif actif"
          value={loading ? "…" : String(summary?.activeHeadcount ?? 0)}
          icon={Users}
          color="amber"
          testId="stat-headcount"
        />
        <StatCard
          label="Fiches de paie"
          value={loading ? "…" : String(summary?.payslipCount ?? 0)}
          icon={FileText}
          color="blue"
          testId="stat-payslips"
        />
        <StatCard
          label="Alertes"
          value={loading ? "…" : String(summary?.pendingAbsenceAlerts ?? 0)}
          icon={AlertCircle}
          color={(summary?.pendingAbsenceAlerts ?? 0) > 0 ? "red" : "green"}
          testId="stat-alerts"
        />
        <StatCard
          label={
            summary?.hasEstimatedEmployerCharges
              ? "Masse salariale (≈)"
              : "Masse salariale"
          }
          value={loading ? "…" : formatEUR(summary?.monthlyPayrollMass ?? 0)}
          icon={Wallet}
          color="purple"
          warning={
            summary?.hasEstimatedEmployerCharges
              ? "Charges patronales estimées sur certaines fiches"
              : undefined
          }
          testId="stat-payroll-mass"
        />
      </div>
    </div>
  );
}

// =================== Employee row (collapsible) ===================

function EmployeeRow({
  employee,
  expanded,
  onToggle,
  onEdit,
  onArchive,
  tenantSlug,
}: {
  employee: Employee;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
  tenantSlug: string;
}) {
  return (
    <li
      className={cn(
        "transition-colors",
        expanded ? "bg-amber-50/50 dark:bg-amber-500/5" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
      )}
      data-testid={`row-employee-${employee.id}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
          aria-expanded={expanded}
          aria-label={expanded ? "Replier" : "Déplier"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium truncate">
              {employee.firstName} {employee.lastName}
            </span>
            {employee.position && (
              <span className="text-xs text-muted-foreground truncate">
                · {employee.position}
              </span>
            )}
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
              {employee.contractType}
            </span>
            {!employee.isActive && (
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                Archivé
              </span>
            )}
          </div>
        </div>
        <div className="text-sm text-right hidden sm:block min-w-0">
          {employee.salary !== null && (
            <span className="font-medium">{formatEUR(employee.salary)}/mois</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="p-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
            title="Modifier"
            aria-label="Modifier"
            data-testid={`btn-edit-employee-${employee.id}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
          {employee.isActive && (
            <button
              type="button"
              onClick={onArchive}
              className="p-2 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600"
              title="Archiver"
              aria-label="Archiver"
              data-testid={`btn-archive-employee-${employee.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {expanded && <EmployeeDetail employee={employee} tenantSlug={tenantSlug} />}
    </li>
  );
}

// =================== Employee detail (sub-sections) ===================

function EmployeeDetail({ employee, tenantSlug }: { employee: Employee; tenantSlug: string }) {
  return (
    <div className="px-4 pb-4 pt-1 space-y-4 border-t dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <AbsencesSubSection employee={employee} tenantSlug={tenantSlug} />
      <PayslipsSubSection employee={employee} tenantSlug={tenantSlug} />
      <FilesSubSection employee={employee} tenantSlug={tenantSlug} />
    </div>
  );
}

// --- Absences ---

function AbsencesSubSection({ employee, tenantSlug }: { employee: Employee; tenantSlug: string }) {
  const apiBase = `/api/management/${tenantSlug}`;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const q = useQuery<{ absences: Absence[] }>({
    queryKey: [`${apiBase}/absences`, { employeeId: employee.id }],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/absences?employeeId=${employee.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Erreur chargement absences");
      return r.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, isApproved }: { id: number; isApproved: boolean }) => {
      const r = await fetch(`${apiBase}/absences/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isApproved }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erreur");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/absences`] });
      qc.invalidateQueries({ queryKey: [`${apiBase}/employees/summary`] });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${apiBase}/absences/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error || "Erreur");
    },
    onSuccess: () => {
      toast({ title: "Absence supprimée" });
      qc.invalidateQueries({ queryKey: [`${apiBase}/absences`] });
      qc.invalidateQueries({ queryKey: [`${apiBase}/employees/summary`] });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const rows = q.data?.absences ?? [];

  return (
    <SubSection
      title="Absences & Congés"
      icon={CalendarOff}
      count={rows.length}
      action={
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600"
          data-testid={`btn-new-absence-${employee.id}`}
        >
          <Plus className="w-3.5 h-3.5" />
          Déclarer absence
        </button>
      }
    >
      {q.isLoading ? (
        <SubSectionLoading />
      ) : rows.length === 0 ? (
        <SubSectionEmpty>Aucune absence sur cette période</SubSectionEmpty>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left py-1 font-medium">Type</th>
              <th className="text-left py-1 font-medium">Du</th>
              <th className="text-left py-1 font-medium">Au</th>
              <th className="text-left py-1 font-medium hidden sm:table-cell">Motif</th>
              <th className="text-right py-1 font-medium">Statut</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-zinc-800">
            {rows.map((a) => (
              <tr key={a.id} data-testid={`row-absence-${a.id}`}>
                <td className="py-1.5">{ABSENCE_TYPE_LABELS[a.type] ?? a.type}</td>
                <td className="py-1.5">{formatDate(a.startDate)}</td>
                <td className="py-1.5">{formatDate(a.endDate)}</td>
                <td className="py-1.5 hidden sm:table-cell text-muted-foreground truncate max-w-xs">
                  {a.reason ?? "—"}
                </td>
                <td className="py-1.5 text-right">
                  {a.isApproved ? (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">
                      ✓ Approuvée
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => approveMutation.mutate({ id: a.id, isApproved: true })}
                      className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300"
                      title="Approuver"
                    >
                      <Check className="w-3 h-3" /> En attente
                    </button>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Supprimer cette absence ?")) deleteMutation.mutate(a.id);
                    }}
                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600"
                    title="Supprimer"
                    aria-label="Supprimer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && (
        <AbsenceFormDialog
          tenantSlug={tenantSlug}
          employee={employee}
          onClose={() => setCreating(false)}
        />
      )}
    </SubSection>
  );
}

// --- Payslips ---

function PayslipsSubSection({ employee, tenantSlug }: { employee: Employee; tenantSlug: string }) {
  const apiBase = `/api/management/${tenantSlug}`;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const q = useQuery<{ payroll: Payroll[] }>({
    queryKey: [`${apiBase}/payroll`, { employeeId: employee.id }],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/payroll?employeeId=${employee.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Erreur chargement fiches");
      return r.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${apiBase}/payroll/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error || "Erreur");
    },
    onSuccess: () => {
      toast({ title: "Fiche supprimée" });
      qc.invalidateQueries({ queryKey: [`${apiBase}/payroll`] });
      qc.invalidateQueries({ queryKey: [`${apiBase}/employees/summary`] });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const rows = q.data?.payroll ?? [];

  return (
    <SubSection
      title="Fiches de Paie"
      icon={Banknote}
      count={rows.length}
      action={
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600"
          data-testid={`btn-new-payslip-${employee.id}`}
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter fiche
        </button>
      }
    >
      {q.isLoading ? (
        <SubSectionLoading />
      ) : rows.length === 0 ? (
        <SubSectionEmpty>Aucune fiche de paie</SubSectionEmpty>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left py-1 font-medium">Période</th>
              <th className="text-right py-1 font-medium">Brut</th>
              <th className="text-right py-1 font-medium">Net</th>
              <th className="text-right py-1 font-medium hidden sm:table-cell">Charges</th>
              <th className="text-right py-1 font-medium">Statut</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-zinc-800">
            {rows.map((p) => (
              <tr key={p.id} data-testid={`row-payslip-${p.id}`}>
                <td className="py-1.5 font-medium">{formatDate(p.month)}</td>
                <td className="py-1.5 text-right">{formatEUR(p.grossSalary)}</td>
                <td className="py-1.5 text-right">{formatEUR(p.netSalary)}</td>
                <td className="py-1.5 text-right hidden sm:table-cell text-muted-foreground">
                  {formatEUR(p.socialCharges)}
                </td>
                <td className="py-1.5 text-right">
                  {p.isPaid ? (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">
                      Payée
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                      En attente
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Supprimer cette fiche ?")) deleteMutation.mutate(p.id);
                    }}
                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600"
                    title="Supprimer"
                    aria-label="Supprimer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && (
        <PayslipFormDialog
          tenantSlug={tenantSlug}
          employee={employee}
          onClose={() => setCreating(false)}
        />
      )}
    </SubSection>
  );
}

// --- Files RH ---

function FilesSubSection({ employee, tenantSlug }: { employee: Employee; tenantSlug: string }) {
  const apiBase = `/api/management/${tenantSlug}`;

  const q = useQuery<{ files: FileRow[] }>({
    queryKey: [`${apiBase}/files`, { category: "rh", employeeId: employee.id }],
    queryFn: async () => {
      // Le backend ne supporte pas encore le filtre `?employeeId=N` sur `/files`
      // (ajouté au schema mais pas wiré dans les routes V1). On filtre côté
      // client : récupère tous les files RH du tenant + filtre.
      const r = await fetch(`${apiBase}/files?category=rh`, { credentials: "include" });
      if (!r.ok) throw new Error("Erreur chargement documents");
      const data: { files: FileRow[] } = await r.json();
      const filtered = data.files.filter((f) => f.employeeId === employee.id);
      return { files: filtered };
    },
  });

  const rows = q.data?.files ?? [];

  return (
    <SubSection
      title="Documents Ressources Humaines"
      icon={FolderOpen}
      count={rows.length}
      action={
        <span className="text-[11px] text-muted-foreground">
          Upload : section Fichiers
        </span>
      }
    >
      {q.isLoading ? (
        <SubSectionLoading />
      ) : rows.length === 0 ? (
        <SubSectionEmpty>Aucun document RH lié à cet employé</SubSectionEmpty>
      ) : (
        <ul className="divide-y dark:divide-zinc-800 text-sm">
          {rows.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 py-1.5"
              data-testid={`row-file-${f.id}`}
            >
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{f.originalName}</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {formatDate(f.fileDate)}
              </span>
              <a
                href={`${apiBase}/files/${f.id}/download`}
                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                title="Télécharger"
                aria-label="Télécharger"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </SubSection>
  );
}

// =================== Sub-section primitives ===================

function SubSection({
  title,
  icon: Icon,
  count,
  action,
  children,
}: {
  title: string;
  icon: typeof Users;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-zinc-50/50 dark:bg-zinc-800/30 p-3 sm:p-4">
      <header className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold">
            {title} <span className="text-muted-foreground font-normal">({count})</span>
          </h3>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function SubSectionLoading() {
  return (
    <div className="text-xs text-muted-foreground py-2 text-center">
      <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
      Chargement…
    </div>
  );
}

function SubSectionEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground py-3 text-center italic">{children}</div>
  );
}
