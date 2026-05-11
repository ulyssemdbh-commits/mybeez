/**
 * History cross-module — pure decorator for audit_log rows.
 *
 * Sprint 7 module métier (PR #88). The history view is a unified feed
 * of every tracked action across the tenant (purchases, expenses,
 * payroll, files, employees, absences, bank, cash, auth, …). All those
 * actions already write to `audit_log` via `recordAudit({event, …})`,
 * so the history endpoint is just `SELECT FROM audit_log + filters +
 * decoration`. No new table, no duplication.
 *
 * This module covers the **pure decoration** : given the raw
 * `audit_log` row, produce a row enriched with :
 *   - `module` : the high-level category (`purchases`, `payroll`, …)
 *   - `action` : the verb (`created`, `updated`, `archived`, …)
 *   - `outcome` : optional (`success`, `failure`) for auth events
 *   - `label` : a French human-readable phrase ("Achat créé", "MFA
 *     désactivée", …)
 *   - `entityType` / `entityId` : the principal business row touched,
 *     extracted from `metadata` for deep-linking from the UI
 *
 * Everything is computed without IO so vitest can cover it without a
 * DB. The route handler queries `audit_log` then maps `decorateRow`
 * across the result set.
 */

/**
 * Domain → user-facing label. Kept here so the UI doesn't have to
 * own this mapping ; if the vocabulary evolves we change one place.
 *
 * Domains that don't appear here fall back to the raw module slug —
 * acceptable for less common events (lockout, audit, …).
 */
export const MODULE_LABELS: Record<string, string> = {
  auth: "Authentification",
  mfa: "MFA",
  password: "Mot de passe",
  tenant: "Tenant",
  tenants: "Tenant",
  user: "Utilisateur",
  users: "Utilisateur",
  purchases: "Achat",
  expenses: "Dépense",
  suppliers: "Fournisseur",
  files: "Fichier",
  employees: "Employé",
  payroll: "Fiche de paie",
  absences: "Absence",
  bankAccounts: "Compte bancaire",
  bankEntries: "Opération bancaire",
  cashEntries: "Opération de caisse",
  checklist: "Checklist",
  alfred: "Alfred",
  template: "Template",
  templates: "Template",
  vocabulary: "Vocabulaire",
  modules: "Modules",
};

/**
 * Action → label. Same fallback policy.
 *
 * The third segment (outcome) is appended to the label only for auth-
 * related events where success/failure carries the meaning (a "login
 * failure" is not the same row as a "login success"). For business
 * actions (purchases.created, payroll.imported, …) we omit it because
 * a row in audit_log implies success anyway.
 */
export const ACTION_LABELS: Record<string, string> = {
  created: "créé",
  updated: "mis à jour",
  archived: "archivé",
  deleted: "supprimé",
  imported: "importé",
  emailed: "envoyé par email",
  uploaded: "téléversé",
  trashed: "envoyé à la corbeille",
  restored: "restauré",
  purged: "purgé",
  login: "connexion",
  logout: "déconnexion",
  signup: "inscription",
  reset: "réinitialisé",
  enabled: "activé",
  disabled: "désactivé",
  confirmed: "confirmé",
  challenge: "challenge",
  recovery: "recovery",
  lockout: "lockout",
  changed: "modifié",
};

export interface ParsedEvent {
  /** First segment, e.g. `purchases`. */
  module: string;
  /** Second segment, e.g. `created`. */
  action: string;
  /** Third segment if present, e.g. `success`, `failure`. */
  outcome: string | null;
}

/**
 * Parse `domain.action.outcome` (kebab-case allowed inside each
 * segment). Returns `null` for empty or single-segment strings.
 *
 * We're defensive on shape : audit_log is append-only, but old rows
 * predating the convention may exist. A null parse means "show the
 * raw event as-is, no decoration".
 */
export function parseEvent(event: string): ParsedEvent | null {
  if (!event || typeof event !== "string") return null;
  const trimmed = event.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(".");
  if (parts.length < 2) return null;
  return {
    module: parts[0]!,
    action: parts[1]!,
    outcome: parts.length >= 3 ? parts.slice(2).join(".") : null,
  };
}

/**
 * Build the French label for a parsed event. Falls back gracefully :
 *   - unknown module → raw slug
 *   - unknown action → raw slug
 *   - outcome appended only when the action label benefits from it
 *     (login success/failure)
 */
export function buildLabel(parsed: ParsedEvent): string {
  const moduleLabel = MODULE_LABELS[parsed.module] ?? parsed.module;
  const actionLabel = ACTION_LABELS[parsed.action] ?? parsed.action;
  // Auth events distinguish success/failure : the outcome matters.
  if (parsed.outcome && (parsed.outcome === "success" || parsed.outcome === "failure")) {
    const tail = parsed.outcome === "success" ? "réussi" : "échec";
    return `${moduleLabel} — ${actionLabel} (${tail})`;
  }
  return `${moduleLabel} ${actionLabel}`;
}

/**
 * Mapping module → field name in `metadata` that carries the principal
 * entity id. Used by `extractEntityRef` to drive a deep-link from the
 * history row to the source page in the UI.
 *
 * We keep this list explicit rather than guessing : a wrong mapping
 * would 404 on the front, an unmapped module just doesn't deep-link.
 */
const MODULE_ENTITY_FIELDS: Record<string, { entityType: string; idField: string }> = {
  purchases: { entityType: "purchase", idField: "purchaseId" },
  expenses: { entityType: "expense", idField: "expenseId" },
  suppliers: { entityType: "supplier", idField: "supplierId" },
  files: { entityType: "file", idField: "fileId" },
  employees: { entityType: "employee", idField: "employeeId" },
  payroll: { entityType: "payroll", idField: "payrollId" },
  absences: { entityType: "absence", idField: "absenceId" },
  bankAccounts: { entityType: "bankAccount", idField: "accountId" },
  bankEntries: { entityType: "bankEntry", idField: "entryId" },
  cashEntries: { entityType: "cashEntry", idField: "entryId" },
};

export interface EntityRef {
  entityType: string;
  entityId: number;
}

/**
 * Extract the principal entity id from a metadata payload, if the
 * audit event documents one. Returns `null` when the module doesn't
 * have a deep-linkable entity (auth events, template changes, …) or
 * when the id field is missing/malformed.
 */
export function extractEntityRef(
  module: string,
  metadata: Record<string, unknown> | null | undefined,
): EntityRef | null {
  if (!metadata || typeof metadata !== "object") return null;
  const mapping = MODULE_ENTITY_FIELDS[module];
  if (!mapping) return null;
  const raw = metadata[mapping.idField];
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return { entityType: mapping.entityType, entityId: raw };
}

export interface DecoratedHistoryRow {
  id: number;
  createdAt: Date;
  event: string;
  module: string;
  action: string;
  outcome: string | null;
  label: string;
  userId: number | null;
  tenantId: number | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  entityType: string | null;
  entityId: number | null;
}

export interface RawAuditRow {
  id: number;
  createdAt: Date;
  event: string;
  userId: number | null;
  tenantId: number | null;
  metadata: Record<string, unknown> | null | undefined;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Turn a raw `audit_log` row into a history-ready shape. Falls back
 * to `{module: 'unknown', action: 'unknown', label: <raw event>}` on
 * malformed events so the route never throws on legacy data.
 */
export function decorateRow(row: RawAuditRow): DecoratedHistoryRow {
  const parsed = parseEvent(row.event);
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  if (!parsed) {
    return {
      id: row.id,
      createdAt: row.createdAt,
      event: row.event,
      module: "unknown",
      action: "unknown",
      outcome: null,
      label: row.event,
      userId: row.userId,
      tenantId: row.tenantId,
      metadata,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      entityType: null,
      entityId: null,
    };
  }
  const label = buildLabel(parsed);
  const entityRef = extractEntityRef(parsed.module, metadata);
  return {
    id: row.id,
    createdAt: row.createdAt,
    event: row.event,
    module: parsed.module,
    action: parsed.action,
    outcome: parsed.outcome,
    label,
    userId: row.userId,
    tenantId: row.tenantId,
    metadata,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    entityType: entityRef?.entityType ?? null,
    entityId: entityRef?.entityId ?? null,
  };
}

/** The set of modules surfaced as filter options on the UI. Mirrors `MODULE_LABELS`. */
export const FILTERABLE_MODULES = Object.keys(MODULE_LABELS) as readonly string[];
