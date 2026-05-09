import { describe, it, expect } from "vitest";
import { matchEmployee, type CandidateEmployee } from "../employeeMatching";

const candidates: CandidateEmployee[] = [
  { id: 1, firstName: "Sophie", lastName: "Martin", socialSecurityNumber: "1 85 03 75 123 456 78" },
  { id: 2, firstName: "Jean-Pierre", lastName: "Dupont", socialSecurityNumber: "2 70 11 92 234 567 89" },
  { id: 3, firstName: "Aïcha", lastName: "Benzouari", socialSecurityNumber: null },
  { id: 4, firstName: "Marc", lastName: "Lefèvre", socialSecurityNumber: "1 80 04 75 345 678 90" },
];

describe("matchEmployee", () => {
  it("retourne tier 'none' sur une liste vide", () => {
    const r = matchEmployee({ firstName: "X", lastName: "Y" }, []);
    expect(r).toEqual({ employeeId: null, tier: "none" });
  });

  it("matche par SSN exact (priorité 1) malgré différence d'espaces", () => {
    const r = matchEmployee(
      { firstName: "Soph", lastName: "Mart", socialSecurityNumber: "185037512345678" },
      candidates,
    );
    expect(r).toEqual({ employeeId: 1, tier: "ssn" });
  });

  it("ignore SSN trop court (< 8 chars) pour éviter faux positifs", () => {
    const r = matchEmployee(
      { firstName: "Sophie", lastName: "Martin", socialSecurityNumber: "1 85" },
      candidates,
    );
    // tombe sur exact_name
    expect(r).toEqual({ employeeId: 1, tier: "exact_name" });
  });

  it("matche par nom exact case-insensitive (priorité 2)", () => {
    const r = matchEmployee({ firstName: "JEAN-PIERRE", lastName: "dupont" }, candidates);
    expect(r).toEqual({ employeeId: 2, tier: "exact_name" });
  });

  it("matche permutation first/last", () => {
    const r = matchEmployee({ firstName: "Martin", lastName: "Sophie" }, candidates);
    expect(r).toEqual({ employeeId: 1, tier: "exact_name" });
  });

  it("matche par fuzzy si exact échoue", () => {
    // "Aich" est inclus dans "Aïcha" — mais pas avec accent. Test sans accent.
    const r = matchEmployee({ firstName: "Marc", lastName: "Lefev" }, candidates);
    expect(r).toEqual({ employeeId: 4, tier: "fuzzy" });
  });

  it("ne matche pas en fuzzy si une seule des deux moities matche", () => {
    const r = matchEmployee({ firstName: "Marc", lastName: "InconnuTotalement" }, candidates);
    expect(r).toEqual({ employeeId: null, tier: "none" });
  });

  it("ne matche pas en fuzzy avec moins de 3 chars (évite 'Le' qui matche tout)", () => {
    const r = matchEmployee({ firstName: "Le", lastName: "Le" }, candidates);
    expect(r).toEqual({ employeeId: null, tier: "none" });
  });

  it("priorité SSN > exact_name > fuzzy (premier hit gagne)", () => {
    const all: CandidateEmployee[] = [
      { id: 10, firstName: "Aliceee", lastName: "Wonder", socialSecurityNumber: "111111111111111" },
      { id: 20, firstName: "Alice", lastName: "Wonder", socialSecurityNumber: "999999999999999" },
    ];
    // SSN matche id=10 même si exact_name aurait matche id=20
    const r = matchEmployee(
      { firstName: "Alice", lastName: "Wonder", socialSecurityNumber: "111111111111111" },
      all,
    );
    expect(r).toEqual({ employeeId: 10, tier: "ssn" });
  });

  it("retourne 'none' si parsed n'a ni SSN ni nom complet", () => {
    const r = matchEmployee({ firstName: "Sophie", lastName: null }, candidates);
    expect(r).toEqual({ employeeId: null, tier: "none" });
  });

  it("retourne 'none' si tout est vide", () => {
    const r = matchEmployee({}, candidates);
    expect(r).toEqual({ employeeId: null, tier: "none" });
  });
});
