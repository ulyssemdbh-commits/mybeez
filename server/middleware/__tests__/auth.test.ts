import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireSuperadmin } from "../auth";

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
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

describe("requireSuperadmin", () => {
  const original = process.env.SUPERADMIN_TOKEN;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.SUPERADMIN_TOKEN = original;
    vi.restoreAllMocks();
  });

  it("503 when SUPERADMIN_TOKEN unset", () => {
    delete process.env.SUPERADMIN_TOKEN;
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireSuperadmin(makeReq({ authorization: "Bearer anything" }), res, next);
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("503 when token shorter than 16 chars", () => {
    process.env.SUPERADMIN_TOKEN = "tooshort";
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireSuperadmin(makeReq({ authorization: "Bearer tooshort" }), res, next);
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("401 when no Authorization header", () => {
    process.env.SUPERADMIN_TOKEN = "this-is-a-long-secret-token";
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireSuperadmin(makeReq({}), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("401 when scheme is not Bearer", () => {
    process.env.SUPERADMIN_TOKEN = "this-is-a-long-secret-token";
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireSuperadmin(makeReq({ authorization: "Basic xyz" }), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("403 when token does not match", () => {
    process.env.SUPERADMIN_TOKEN = "this-is-a-long-secret-token";
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireSuperadmin(makeReq({ authorization: "Bearer wrong-token-here" }), res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("403 when provided token differs in length", () => {
    process.env.SUPERADMIN_TOKEN = "this-is-a-long-secret-token";
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireSuperadmin(
      makeReq({ authorization: "Bearer this-is-a-long-secret-token-extra" }),
      res,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when token matches", () => {
    process.env.SUPERADMIN_TOKEN = "this-is-a-long-secret-token";
    const res = makeRes() as ReturnType<typeof makeRes>;
    const next = vi.fn() as unknown as NextFunction;
    requireSuperadmin(
      makeReq({ authorization: "Bearer this-is-a-long-secret-token" }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });
});
