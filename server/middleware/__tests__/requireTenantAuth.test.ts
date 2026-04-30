import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireTenantAuth } from "../auth";

interface FakeSession {
  authenticated?: boolean;
  tenantId?: number;
  role?: string;
}

function makeReq(session: FakeSession | undefined, tenantId?: number): Request {
  return { session, tenantId } as unknown as Request;
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

describe("requireTenantAuth", () => {
  it("401 when session is undefined", () => {
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireTenantAuth(makeReq(undefined, 1), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("401 when session is not authenticated", () => {
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireTenantAuth(makeReq({ authenticated: false, tenantId: 1 }, 1), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("403 when session tenantId differs from req.tenantId", () => {
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireTenantAuth(
      makeReq({ authenticated: true, tenantId: 2, role: "staff" }, 1),
      res,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when session tenantId matches req.tenantId", () => {
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireTenantAuth(
      makeReq({ authenticated: true, tenantId: 1, role: "staff" }, 1),
      res,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("calls next() when session role is superadmin even if tenantId differs", () => {
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireTenantAuth(
      makeReq({ authenticated: true, tenantId: 99, role: "superadmin" }, 1),
      res,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("calls next() when req.tenantId is absent (preserves legacy behavior; resolveTenant must run first)", () => {
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireTenantAuth(
      makeReq({ authenticated: true, tenantId: 1, role: "staff" }, undefined),
      res,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
