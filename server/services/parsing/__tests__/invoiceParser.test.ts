import { describe, it, expect } from "vitest";
import {
  validateBase64Image,
  stripCodeFence,
  InvoiceFieldsSchema,
  SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  normalizeSupplierName,
  matchSupplierByName,
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

  it("accepte les images jpeg/png/webp et application/pdf", () => {
    for (const mime of SUPPORTED_MIME_TYPES) {
      const r = validateBase64Image(TINY_PNG, mime);
      expect(r.ok, `mime=${mime}`).toBe(true);
    }
  });

  it("refuse les types non supportés", () => {
    const r = validateBase64Image(TINY_PNG, "text/plain");
    expect(r.ok).toBe(false);
  });

  it("refuse un type bidon proche du PDF", () => {
    const r = validateBase64Image(TINY_PNG, "application/x-pdf");
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
    if (!r.ok) expect(r.error.toLowerCase()).toContain("trop volumineu");
  });

  it("accepte un PDF jusqu'à 10 MB et refuse au-delà", () => {
    // base64 d'env. 9 MB de données — sous la limite 10 MB.
    const under = "A".repeat(Math.floor((MAX_PDF_BYTES - 1024 * 1024) * 4 / 3));
    const okR = validateBase64Image(under, "application/pdf");
    expect(okR.ok).toBe(true);

    const over = "A".repeat(MAX_PDF_BYTES * 2);
    const r = validateBase64Image(over, "application/pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("pdf");
  });

  it("refuse une image au-delà de 5 MB même si la limite PDF est plus haute", () => {
    // 7 MB d'image décodée → au-dessus de MAX_IMAGE_BYTES (5MB)
    // mais en dessous de MAX_PDF_BYTES (10MB). Doit être refusé sur l'image.
    const sevenMB = "A".repeat(Math.floor(7 * 1024 * 1024 * 4 / 3));
    const r = validateBase64Image(sevenMB, "image/png");
    expect(r.ok).toBe(false);
  });
});

describe("SUPPORTED_IMAGE_MIME_TYPES", () => {
  it("ne contient que des image/*", () => {
    for (const mime of SUPPORTED_IMAGE_MIME_TYPES) {
      expect(mime.startsWith("image/")).toBe(true);
    }
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

describe("normalizeSupplierName", () => {
  it("met en lowercase et strippe les accents", () => {
    expect(normalizeSupplierName("Métro France")).toBe("metro france");
    expect(normalizeSupplierName("Café René")).toBe("cafe rene");
  });

  it("retire les formes juridiques courantes", () => {
    expect(normalizeSupplierName("Établissements Dupont SARL")).toBe("etablissements dupont");
    expect(normalizeSupplierName("Boulangerie SAS")).toBe("boulangerie");
    expect(normalizeSupplierName("Trucmuche & Co Ltd")).toBe("trucmuche");
  });

  it("collapse espaces et ponctuation", () => {
    expect(normalizeSupplierName("  Foo,  bar.   baz  ")).toBe("foo bar baz");
    expect(normalizeSupplierName("AB-CD/EF")).toBe("ab cd ef");
  });

  it("retourne string vide pour input vide", () => {
    expect(normalizeSupplierName("")).toBe("");
    expect(normalizeSupplierName("   ")).toBe("");
  });
});

describe("matchSupplierByName", () => {
  const SUPPLIERS = [
    { id: 1, name: "Métro France", shortName: null },
    { id: 2, name: "EDF Entreprises", shortName: "EDF" },
    { id: 3, name: "Boulangerie Dupont SARL", shortName: "Dupont" },
    { id: 4, name: "Pomona TerreAzur", shortName: null },
  ];

  it("trouve un match exact (insensible casse + accents)", () => {
    const r = matchSupplierByName("METRO FRANCE", SUPPLIERS);
    expect(r?.supplierId).toBe(1);
    expect(r?.score).toBe(1);
  });

  it("matche via shortName quand l'OCR donne le nom court", () => {
    const r = matchSupplierByName("EDF", SUPPLIERS);
    expect(r?.supplierId).toBe(2);
  });

  it("matche substring (raison sociale longue côté OCR)", () => {
    // L'OCR voit "Métro France SAS — Lyon Vaise" → contient "Métro France"
    const r = matchSupplierByName("Métro France SAS Lyon Vaise", SUPPLIERS);
    expect(r?.supplierId).toBe(1);
  });

  it("matche par token-overlap quand l'ordre des mots diffère", () => {
    const r = matchSupplierByName("Dupont Boulangerie", SUPPLIERS);
    expect(r?.supplierId).toBe(3);
  });

  it("retourne null si aucun fournisseur ne correspond", () => {
    expect(matchSupplierByName("Carrefour", SUPPLIERS)).toBeNull();
  });

  it("retourne null pour un nom OCR vide", () => {
    expect(matchSupplierByName("", SUPPLIERS)).toBeNull();
    expect(matchSupplierByName(null, SUPPLIERS)).toBeNull();
    expect(matchSupplierByName(undefined, SUPPLIERS)).toBeNull();
  });

  it("retourne null si la liste de candidats est vide", () => {
    expect(matchSupplierByName("Métro France", [])).toBeNull();
  });

  it("préfère le score le plus haut quand plusieurs candidats correspondent", () => {
    // "EDF Entreprises Île-de-France" → exact normalisé sur le name complet,
    // mais aussi substring sur shortName "EDF". Doit garder le score 1.0.
    const r = matchSupplierByName("EDF Entreprises", SUPPLIERS);
    expect(r?.supplierId).toBe(2);
    expect(r?.score).toBe(1);
  });

  it("ignore les fournisseurs dont le nom normalisé est trop court (faux positifs)", () => {
    // Un fournisseur "AB" pourrait matcher tout et n'importe quoi via substring.
    // L'algo n'utilise substring que si la norm a >= 4 chars.
    const tinies = [{ id: 99, name: "AB", shortName: null }];
    expect(matchSupplierByName("AB Solutions Industrielles", tinies)).toBeNull();
  });
});
