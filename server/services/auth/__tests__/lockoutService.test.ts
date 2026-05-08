import { describe, it, expect } from "vitest";
import { computeLockout, LOCKOUT_CONSTANTS } from "../lockoutService";

const NOW = new Date("2026-05-08T12:00:00.000Z");

function failuresAgoSeconds(...secondsAgo: number[]): Date[] {
  return secondsAgo.map((s) => new Date(NOW.getTime() - s * 1000));
}

describe("computeLockout", () => {
  it("retourne unlocked si aucun échec", () => {
    const r = computeLockout([], NOW);
    expect(r.locked).toBe(false);
    expect(r.failureCount).toBe(0);
    expect(r.retryAfterSeconds).toBe(0);
  });

  it("retourne unlocked si failureCount < threshold", () => {
    const r = computeLockout(failuresAgoSeconds(60, 120, 180, 240), NOW);
    expect(r.locked).toBe(false);
    expect(r.failureCount).toBe(4);
    expect(r.retryAfterSeconds).toBe(0);
  });

  it("verrouille au seuil exact (5 échecs dans la fenêtre)", () => {
    const r = computeLockout(failuresAgoSeconds(60, 120, 180, 240, 300), NOW);
    expect(r.locked).toBe(true);
    expect(r.failureCount).toBe(5);
    // Le plus ancien (300s = 5min) sortira de la fenêtre dans 15min - 5min = 10min = 600s
    expect(r.retryAfterSeconds).toBe(600);
  });

  it("retryAfter = quand le plus ancien échec sort de la fenêtre", () => {
    // Plus ancien il y a 14min — sortira dans 1min = 60s
    const r = computeLockout(failuresAgoSeconds(60, 120, 180, 240, 14 * 60), NOW);
    expect(r.locked).toBe(true);
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(59);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(61);
  });

  it("retryAfter clamp à 1 seconde minimum", () => {
    // Plus ancien il y a EXACTEMENT 15min - epsilon : devrait sortir tout de suite
    const r = computeLockout(
      failuresAgoSeconds(60, 120, 180, 240, LOCKOUT_CONSTANTS.windowMs / 1000 - 0.5),
      NOW,
    );
    expect(r.locked).toBe(true);
    expect(r.retryAfterSeconds).toBe(1);
  });

  it("ignore les échecs hors fenêtre", () => {
    // 4 dans la fenêtre + 3 il y a 20min (hors)
    const r = computeLockout(
      failuresAgoSeconds(60, 120, 180, 240, 20 * 60, 25 * 60, 30 * 60),
      NOW,
    );
    expect(r.locked).toBe(false);
    expect(r.failureCount).toBe(4);
  });

  it("compte tous les échecs dans la fenêtre, pas seulement les threshold premiers", () => {
    const r = computeLockout(failuresAgoSeconds(60, 120, 180, 240, 300, 360, 420), NOW);
    expect(r.locked).toBe(true);
    expect(r.failureCount).toBe(7);
    // Plus ancien dans la fenêtre = 420s, retryAfter = 15*60 - 420 = 480s
    expect(r.retryAfterSeconds).toBe(480);
  });

  it("ordre d'entrée non significatif (tri interne)", () => {
    const a = computeLockout(failuresAgoSeconds(300, 60, 240, 120, 180), NOW);
    const b = computeLockout(failuresAgoSeconds(60, 120, 180, 240, 300), NOW);
    expect(a).toEqual(b);
  });

  it("threshold custom respecté", () => {
    const r = computeLockout(failuresAgoSeconds(60, 120, 180), NOW, 3, LOCKOUT_CONSTANTS.windowMs);
    expect(r.locked).toBe(true);
    expect(r.failureCount).toBe(3);
  });

  it("windowMs custom respecté", () => {
    // Fenêtre 5min : seul l'échec à 60s compte
    const r = computeLockout(
      failuresAgoSeconds(60, 7 * 60, 8 * 60, 9 * 60, 10 * 60),
      NOW,
      5,
      5 * 60_000,
    );
    expect(r.locked).toBe(false);
    expect(r.failureCount).toBe(1);
  });

  it("frontière exacte : un échec à windowMs pile = inclus", () => {
    // windowMs = 15min, on met un échec à 15min pile
    const r = computeLockout(
      failuresAgoSeconds(60, 120, 180, 240, 15 * 60),
      NOW,
    );
    expect(r.locked).toBe(true);
    expect(r.failureCount).toBe(5);
  });

  it("ne mute pas le tableau d'entrée", () => {
    const original = failuresAgoSeconds(300, 60, 240, 120, 180);
    const snapshot = [...original];
    computeLockout(original, NOW);
    expect(original).toEqual(snapshot);
  });
});
