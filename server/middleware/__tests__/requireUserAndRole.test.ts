import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireUser, requireRole, getUserSession } from "../auth";

vi.mock("../../services/auth/userTenantService", () => ({
  userTenantService: {
    getRole: vi.fn(),
  },
}));

interface FakeSession {
  userId?: number;
  currentTenantId?: number;
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

describe("getUserSession", () => {
  it("returns null when session is undefined", () => {
    expect(getUserSession(makeReq(undefined))).toBeNull();
  });
  it("returns null when userId is missing", () => {
    expect(getUserSession(makeReq({}))).toBeNull();
  });
  it("returns the payload when userId is set", () => {
    expect(getUserSession(makeReq({ userId: 42, currentTenantId: 7 }))).toEqual({
      userId: 42,
      currentTenantId: 7,
    });
  });
});

describe("requireUser", () => {
  it("401 when no nominative session", () => {
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireUser(makeReq(undefined), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
  it("calls next() when userId present", () => {
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireUser(makeReq({ userId: 1 }), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("requireRole", () => {
  beforeEach(async () => {
    const { userTenantService } = await import("../../services/auth/userTenantService");
    (userTenantService.getRole as ReturnType<typeof vi.fn>).mockReset();
  });

  it("throws at module-level if any allowed role is unknown", () => {
    expect(() => requireRole("notarole" as never)).toThrow(/unknown role/);
  });

  it("401 when no nominative session", async () => {
    const mw = requireRole("owner");
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    await mw(makeReq(undefined, 1), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("500 when req.tenantId is not resolved (middleware ordering bug)", async () => {
    const mw = requireRole("owner");
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mw(makeReq({ userId: 1 }, undefined), res, next);
    expect(res.statusCode).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it("403 when user has no role on this tenant", async () => {
    const { userTenantService } = await import("../../services/auth/userTenantService");
    (userTenantService.getRole as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const mw = requireRole("owner");
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    await mw(makeReq({ userId: 1 }, 1), res, next);
    expect(res.statusCode).toBe(403);
  });

  it("403 when user's role is not in the allowed list", async () => {
    const { userTenantService } = await import("../../services/auth/userTenantService");
    (userTenantService.getRole as ReturnType<typeof vi.fn>).mockResolvedValue("staff");
    const mw = requireRole("owner", "admin");
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    await mw(makeReq({ userId: 1 }, 1), res, next);
    expect(res.statusCode).toBe(403);
  });

  it("calls next() and exposes role on req when allowed", async () => {
    const { userTenantService } = await import("../../services/auth/userTenantService");
    (userTenantService.getRole as ReturnType<typeof vi.fn>).mockResolvedValue("admin");
    const mw = requireRole("owner", "admin");
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    const req = makeReq({ userId: 1 }, 1);
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userTenantRole).toBe("admin");
  });
});
