import { describe, it, expect } from "vitest";
import {
  parseEvent,
  buildLabel,
  extractEntityRef,
  decorateRow,
  MODULE_LABELS,
  FILTERABLE_MODULES,
} from "../historyDecorator";

describe("parseEvent", () => {
  it("split sur '.' en module/action", () => {
    expect(parseEvent("purchases.created")).toEqual({
      module: "purchases",
      action: "created",
      outcome: null,
    });
  });

  it("capture le 3eme segment comme outcome", () => {
    expect(parseEvent("auth.login.success")).toEqual({
      module: "auth",
      action: "login",
      outcome: "success",
    });
  });

  it("aggrege le 4eme+ segment dans outcome", () => {
    expect(parseEvent("auth.lockout.triggered.delayed")).toEqual({
      module: "auth",
      action: "lockout",
      outcome: "triggered.delayed",
    });
  });

  it("retourne null sur format mono-segment", () => {
    expect(parseEvent("solo")).toBeNull();
  });

  it("retourne null sur input vide ou whitespace", () => {
    expect(parseEvent("")).toBeNull();
    expect(parseEvent("   ")).toBeNull();
  });

  it("retourne null sur input non-string (defense)", () => {
    expect(parseEvent(undefined as unknown as string)).toBeNull();
    expect(parseEvent(null as unknown as string)).toBeNull();
  });
});

describe("buildLabel", () => {
  it("compose module + action en francais quand connus", () => {
    expect(buildLabel({ module: "purchases", action: "created", outcome: null })).toBe(
      "Achat créé",
    );
    expect(buildLabel({ module: "payroll", action: "deleted", outcome: null })).toBe(
      "Fiche de paie supprimé",
    );
  });

  it("ajoute le suffixe (réussi)/(échec) pour les outcomes success/failure", () => {
    expect(buildLabel({ module: "auth", action: "login", outcome: "success" })).toBe(
      "Authentification — connexion (réussi)",
    );
    expect(buildLabel({ module: "auth", action: "signup", outcome: "failure" })).toBe(
      "Authentification — inscription (échec)",
    );
  });

  it("fallback gracieux sur module inconnu", () => {
    expect(buildLabel({ module: "obscure", action: "created", outcome: null })).toBe(
      "obscure créé",
    );
  });

  it("fallback gracieux sur action inconnue", () => {
    expect(buildLabel({ module: "files", action: "thingy", outcome: null })).toBe(
      "Fichier thingy",
    );
  });

  it("ignore les outcomes non success/failure (e.g. 'triggered')", () => {
    expect(buildLabel({ module: "auth", action: "lockout", outcome: "triggered" })).toBe(
      "Authentification lockout",
    );
  });
});

describe("extractEntityRef", () => {
  it("extrait purchaseId pour module purchases", () => {
    expect(extractEntityRef("purchases", { purchaseId: 42 })).toEqual({
      entityType: "purchase",
      entityId: 42,
    });
  });

  it("extrait payrollId pour module payroll", () => {
    expect(extractEntityRef("payroll", { payrollId: 7, employeeId: 1, month: "2026-04" })).toEqual({
      entityType: "payroll",
      entityId: 7,
    });
  });

  it("retourne null pour un module non mappé (auth, etc.)", () => {
    expect(extractEntityRef("auth", { userId: 1 })).toBeNull();
  });

  it("retourne null si l'id field manque dans metadata", () => {
    expect(extractEntityRef("purchases", { supplierId: 1 })).toBeNull();
  });

  it("retourne null si metadata est null/undefined/non-object", () => {
    expect(extractEntityRef("purchases", null)).toBeNull();
    expect(extractEntityRef("purchases", undefined)).toBeNull();
  });

  it("rejette les ids invalides (négatif, 0, NaN, string)", () => {
    expect(extractEntityRef("purchases", { purchaseId: -1 })).toBeNull();
    expect(extractEntityRef("purchases", { purchaseId: 0 })).toBeNull();
    expect(extractEntityRef("purchases", { purchaseId: Number.NaN })).toBeNull();
    expect(extractEntityRef("purchases", { purchaseId: "42" })).toBeNull();
  });
});

describe("decorateRow", () => {
  const ts = new Date("2026-05-11T12:00:00Z");

  it("décore une ligne purchases.created complète", () => {
    const r = decorateRow({
      id: 1,
      createdAt: ts,
      event: "purchases.created",
      userId: 7,
      tenantId: 3,
      metadata: { purchaseId: 42, totalTtc: 1234.56 },
      ipAddress: "1.2.3.4",
      userAgent: "ua/test",
    });
    expect(r).toEqual({
      id: 1,
      createdAt: ts,
      event: "purchases.created",
      module: "purchases",
      action: "created",
      outcome: null,
      label: "Achat créé",
      userId: 7,
      tenantId: 3,
      metadata: { purchaseId: 42, totalTtc: 1234.56 },
      ipAddress: "1.2.3.4",
      userAgent: "ua/test",
      entityType: "purchase",
      entityId: 42,
    });
  });

  it("préserve l'outcome pour les events auth", () => {
    const r = decorateRow({
      id: 2,
      createdAt: ts,
      event: "auth.login.failure",
      userId: null,
      tenantId: null,
      metadata: { reason: "wrong_password" },
      ipAddress: null,
      userAgent: null,
    });
    expect(r.module).toBe("auth");
    expect(r.action).toBe("login");
    expect(r.outcome).toBe("failure");
    expect(r.label).toBe("Authentification — connexion (échec)");
    expect(r.entityType).toBeNull();
  });

  it("fallback gracieux sur event malformé", () => {
    const r = decorateRow({
      id: 3,
      createdAt: ts,
      event: "legacy_event_no_dot",
      userId: null,
      tenantId: null,
      metadata: null,
      ipAddress: null,
      userAgent: null,
    });
    expect(r.module).toBe("unknown");
    expect(r.action).toBe("unknown");
    expect(r.label).toBe("legacy_event_no_dot");
    expect(r.metadata).toEqual({});
    expect(r.entityType).toBeNull();
  });
});

describe("FILTERABLE_MODULES", () => {
  it("contient les modules métier principaux", () => {
    for (const m of [
      "purchases",
      "expenses",
      "files",
      "payroll",
      "employees",
      "absences",
      "bankEntries",
      "cashEntries",
    ]) {
      expect(FILTERABLE_MODULES).toContain(m);
    }
  });

  it("est en sync avec MODULE_LABELS (mêmes clés)", () => {
    const labelKeys = Object.keys(MODULE_LABELS).sort();
    const filterKeys = [...FILTERABLE_MODULES].sort();
    expect(filterKeys).toEqual(labelKeys);
  });
});
