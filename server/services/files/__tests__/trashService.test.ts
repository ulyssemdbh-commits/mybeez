import { describe, it, expect } from "vitest";
import { computeExpiresAt, isExpired, TRASH_TTL_MS } from "../trashService";

describe("computeExpiresAt", () => {
  it("ajoute le TTL par défaut (7 jours) à deletedAt", () => {
    const deletedAt = new Date("2026-05-08T12:00:00.000Z");
    const expected = new Date(deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(computeExpiresAt(deletedAt).getTime()).toBe(expected.getTime());
  });

  it("respecte un TTL custom", () => {
    const deletedAt = new Date("2026-05-08T00:00:00.000Z");
    const ttlOneHour = 60 * 60 * 1000;
    const expected = new Date(deletedAt.getTime() + ttlOneHour);
    expect(computeExpiresAt(deletedAt, ttlOneHour).getTime()).toBe(expected.getTime());
  });

  it("le TTL par défaut est 7 jours", () => {
    expect(TRASH_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("isExpired", () => {
  const NOW = new Date("2026-05-08T12:00:00.000Z");

  it("renvoie true si expiresAt est passé", () => {
    expect(isExpired(new Date(NOW.getTime() - 1000), NOW)).toBe(true);
  });

  it("renvoie false si expiresAt est dans le futur", () => {
    expect(isExpired(new Date(NOW.getTime() + 1000), NOW)).toBe(false);
  });

  it("renvoie false si expiresAt = now exactement (frontière)", () => {
    // Convention : pas encore expiré au timestamp pile (now > expiresAt strict)
    expect(isExpired(NOW, NOW)).toBe(false);
  });

  it("composition correcte avec computeExpiresAt sur 7 jours", () => {
    const deletedAt = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
    const expiresAt = computeExpiresAt(deletedAt);
    // deletedAt 6 jours avant + TTL 7 jours = expire dans 1 jour
    expect(isExpired(expiresAt, NOW)).toBe(false);

    const oldDeletedAt = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000);
    const oldExpires = computeExpiresAt(oldDeletedAt);
    // deletedAt 8 jours avant + TTL 7 jours = expiré il y a 1 jour
    expect(isExpired(oldExpires, NOW)).toBe(true);
  });
});
