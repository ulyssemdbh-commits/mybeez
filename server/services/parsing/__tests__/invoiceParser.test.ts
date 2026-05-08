import { describe, it, expect } from "vitest";
import {
  validateBase64Image,
  stripCodeFence,
  InvoiceFieldsSchema,
  SUPPORTED_MIME_TYPES,
  MAX_IMAGE_BYTES,
} from "../invoiceParser";

describe("validateBase64Image", () => {
  // 1x1 transparent PNG, base64-encoded
  const TINY_PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

  it("accepte un PNG minimal", () => {
    const r = validateBase64Image(TINY_PNG, "image/png");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bytes).toBeGreaterThan(0);
  });

  it("accepte les types image/jpeg, image/png, image/webp", () => {
    for (const mime of SUPPORTED_MIME_TYPES) {
      const r = validateBase64Image(TINY_PNG, mime);
      expect(r.ok, `mime=${mime}`).toBe(true);
    }
  });

  it("refuse application/pdf en V1", () => {
    const r = validateBase64Image(TINY_PNG, "application/pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("PDF");
  });

  it("refuse les types non-image", () => {
    const r = validateBase64Image(TINY_PNG, "text/plain");
    expect(r.ok).toBe(false);
  });

  it("strippe les data URL prefix avant validation", () => {
    const dataUrl = `data:image/png;base64,${TINY_PNG}`;
    const r = validateBase64Image(dataUrl, "image/png");
    expect(r.ok).toBe(true);
  });

  it("refuse un base64 mal formé", () => {
    const r = validateBase64Image("!!! not base64 !!!", "image/png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("base64");
  });

  it("refuse une image trop grosse", () => {
    // Build a base64 that decodes to >5MB.
    const oversized = "A".repeat(MAX_IMAGE_BYTES * 2);
    const r = validateBase64Image(oversized, "image/png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("trop volumineuse");
  });
});

describe("stripCodeFence", () => {
  it("retourne le texte tel quel sans fence", () => {
    expect(stripCodeFence(`{"a":1}`)).toBe(`{"a":1}`);
  });

  it("strippe une fence ```json ... ```", () => {
    expect(stripCodeFence("```json\n{\"a\":1}\n```")).toBe(`{"a":1}`);
  });

  it("strippe une fence ``` ... ```", () => {
    expect(stripCodeFence("```\n{\"a\":1}\n```")).toBe(`{"a":1}`);
  });

  it("ne touche pas un texte avec des backticks au milieu", () => {
    const inner = "abc `not a fence` def";
    expect(stripCodeFence(inner)).toBe(inner);
  });
});

describe("InvoiceFieldsSchema", () => {
  it("accepte un objet complet valide", () => {
    const ok = InvoiceFieldsSchema.parse({
      supplierName: "Métro France",
      invoiceNumber: "F-2026-001",
      invoiceDate: "2026-05-08",
      totalHt: 100.5,
      totalTtc: 110.55,
      tvaRate: 10,
      tvaAmount: 10.05,
      dueDate: "2026-06-08",
      category: "matières premières",
      paymentMethod: "virement",
    });
    expect(ok.supplierName).toBe("Métro France");
  });

  it("accepte tous les champs à null", () => {
    const ok = InvoiceFieldsSchema.parse({
      supplierName: null,
      invoiceNumber: null,
      invoiceDate: null,
      totalHt: null,
      totalTtc: null,
      tvaRate: null,
      tvaAmount: null,
      dueDate: null,
      category: null,
      paymentMethod: null,
    });
    expect(ok.totalTtc).toBeNull();
  });

  it("rejette une date au mauvais format", () => {
    expect(() =>
      InvoiceFieldsSchema.parse({
        supplierName: null,
        invoiceNumber: null,
        invoiceDate: "08/05/2026", // FR format, mais on attend ISO
        totalHt: null,
        totalTtc: null,
        tvaRate: null,
        tvaAmount: null,
        dueDate: null,
        category: null,
        paymentMethod: null,
      }),
    ).toThrow();
  });

  it("rejette un objet incomplet (champ manquant)", () => {
    expect(() =>
      InvoiceFieldsSchema.parse({
        supplierName: null,
        // invoiceNumber manquant
      }),
    ).toThrow();
  });
});
