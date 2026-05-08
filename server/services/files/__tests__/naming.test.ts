import { describe, it, expect } from "vitest";
import {
  sanitiseFileName,
  buildStoredName,
  buildStorageKey,
  parseStorageKey,
} from "../naming";

describe("sanitiseFileName", () => {
  it("garde [A-Za-z0-9._-] tel quel", () => {
    expect(sanitiseFileName("Facture_2026-04-12.pdf")).toBe("Facture_2026-04-12.pdf");
  });

  it("remplace les espaces et chars spéciaux par _", () => {
    expect(sanitiseFileName("ma facture (1).pdf")).toBe("ma_facture__1_.pdf");
  });

  it("gère les accents en les remplaçant", () => {
    expect(sanitiseFileName("dépense-été.png")).toBe("d_pense-_t_.png");
  });

  it("fallback 'file' sur input vide", () => {
    expect(sanitiseFileName("")).toBe("file");
    expect(sanitiseFileName("   ")).toBe("file");
  });

  it("fallback 'file' sur dot-only", () => {
    expect(sanitiseFileName(".")).toBe("file");
    expect(sanitiseFileName("..")).toBe("file");
    expect(sanitiseFileName("...")).toBe("file");
  });

  it("tronque à 200 chars", () => {
    const long = "a".repeat(300);
    const result = sanitiseFileName(long);
    expect(result.length).toBe(200);
  });
});

describe("buildStoredName", () => {
  it("préfixe avec le timestamp ms", () => {
    const fixed = new Date("2026-05-08T12:00:00.000Z");
    const result = buildStoredName("facture.pdf", fixed);
    expect(result).toBe(`${fixed.getTime()}-facture.pdf`);
  });

  it("sanitise le nom embarqué", () => {
    const fixed = new Date(0);
    const result = buildStoredName("ma facture.pdf", fixed);
    expect(result).toBe("0-ma_facture.pdf");
  });
});

describe("buildStorageKey", () => {
  it("compose files/<tenantId>/<storedName>", () => {
    expect(buildStorageKey(42, "1234-facture.pdf")).toBe("files/42/1234-facture.pdf");
  });

  it("garde le prefix `files/` même si tenantId=0 (cas test)", () => {
    expect(buildStorageKey(0, "x.txt")).toBe("files/0/x.txt");
  });
});

describe("parseStorageKey", () => {
  it("extrait tenantId et storedName d'une key valide", () => {
    expect(parseStorageKey("files/42/1234-facture.pdf")).toEqual({
      tenantId: 42,
      storedName: "1234-facture.pdf",
    });
  });

  it("renvoie null si le préfixe ne matche pas", () => {
    expect(parseStorageKey("mybeezdb/2026-05-08/dump.sql.gz")).toBeNull();
    expect(parseStorageKey("random-key")).toBeNull();
  });

  it("renvoie null si tenantId n'est pas un nombre", () => {
    expect(parseStorageKey("files/abc/file.pdf")).toBeNull();
  });

  it("inverse de buildStorageKey", () => {
    const key = buildStorageKey(7, "stored-x.bin");
    expect(parseStorageKey(key)).toEqual({ tenantId: 7, storedName: "stored-x.bin" });
  });
});
