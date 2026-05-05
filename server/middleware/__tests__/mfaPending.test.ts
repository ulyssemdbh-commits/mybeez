import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  getMfaPending,
  clearMfaPending,
  requireMfaPending,
  MFA_PENDING_TTL_MS,
} from "../auth";

function makeReq(session: Record<string, unknown> = {}): Request {
  return { session } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("getMfaPending", () => {
  it("returns null when nothing in session", () => {
    expect(getMfaPending(makeReq({}))).toBeNull();
  });

  it("returns null when only some fields are set", () => {
    expect(getMfaPending(makeReq({ mfaPendingUserId: 1 }))).toBeNull();
    expect(getMfaPending(makeReq({ mfaPendingUserId: 1, mfaPendingAt: 0 }))).toBeNull();
  });

  it("returns the pending payload when fully populated", () => {
    const at = Date.now();
    const got = getMfaPending(makeReq({ mfaPendingUserId: 42, mfaPendingAt: at, mfaPendingId: "abc" }));
    expect(got).toEqual({ userId: 42, at, id: "abc" });
  });
});

describe("clearMfaPending", () => {
  it("removes all three pending keys", () => {
    const session = { mfaPendingUserId: 1, mfaPendingAt: 100, mfaPendingId: "x", userId: 99 } as Record<string, unknown>;
    clearMfaPending(makeReq(session));
    expect(session.mfaPendingUserId).toBeUndefined();
    expect(session.mfaPendingAt).toBeUndefined();
    expect(session.mfaPendingId).toBeUndefined();
    // Does NOT touch the full nominative session.
    expect(session.userId).toBe(99);
  });
});

describe("requireMfaPending", () => {
  it("401 when no pending session", () => {
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireMfaPending(makeReq({}), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("410 when pending state is older than TTL, and clears it", () => {
    const session: Record<string, unknown> = {
      mfaPendingUserId: 7,
      mfaPendingAt: Date.now() - MFA_PENDING_TTL_MS - 1000,
      mfaPendingId: "old",
    };
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireMfaPending(makeReq(session), res, next);
    expect(res.statusCode).toBe(410);
    expect(next).not.toHaveBeenCalled();
    expect(session.mfaPendingUserId).toBeUndefined();
  });

  it("calls next() and exposes req.mfaPending when fresh", () => {
    const session: Record<string, unknown> = {
      mfaPendingUserId: 7,
      mfaPendingAt: Date.now(),
      mfaPendingId: "fresh",
    };
    const req = makeReq(session) as Request & { mfaPending?: unknown };
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireMfaPending(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.mfaPending).toEqual({ userId: 7, at: session.mfaPendingAt, id: "fresh" });
  });
});
