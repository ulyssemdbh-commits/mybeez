import { describe, it, expect, afterEach } from "vitest";
import { routeLabel, metricsBearerToken, registry } from "../metrics";

describe("routeLabel", () => {
  it("prefère le pattern matché par Express", () => {
    const req = { route: { path: "/api/checklist/:slug/items/:id" }, path: "/api/checklist/foo/items/42" };
    expect(routeLabel(req)).toBe("/api/checklist/:slug/items/:id");
  });

  it("fallback sur req.path si pas de route matcher", () => {
    expect(routeLabel({ path: "/api/health" })).toBe("/api/health");
  });

  it("retourne 'unknown' si ni route ni path", () => {
    expect(routeLabel({ path: undefined as unknown as string })).toBe("unknown");
  });

  it("ignore les routes vides (string vide -> unknown via fallback)", () => {
    expect(routeLabel({ route: { path: undefined }, path: "/foo" })).toBe("/foo");
  });
});

describe("metricsBearerToken", () => {
  const original = process.env.METRICS_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = original;
  });

  it("retourne null si la var d'env n'est pas définie", () => {
    delete process.env.METRICS_TOKEN;
    expect(metricsBearerToken()).toBeNull();
  });

  it("retourne null si le token est trop court (<16 chars)", () => {
    process.env.METRICS_TOKEN = "short";
    expect(metricsBearerToken()).toBeNull();
  });

  it("retourne le token quand il est >=16 chars", () => {
    process.env.METRICS_TOKEN = "abcdef0123456789-token";
    expect(metricsBearerToken()).toBe("abcdef0123456789-token");
  });
});

describe("registry", () => {
  it("est instancié et contient les collectors custom + default", async () => {
    const text = await registry.metrics();
    // Default Node.js collectors
    expect(text).toContain("process_cpu_user_seconds_total");
    expect(text).toContain("nodejs_heap_size_total_bytes");
    // Custom collectors
    expect(text).toContain("http_request_duration_seconds");
    expect(text).toContain("http_requests_total");
    expect(text).toContain("db_pool_total");
    expect(text).toContain("ai_provider_configured");
  });

  it("expose le content-type Prometheus standard", () => {
    expect(registry.contentType).toContain("text/plain");
    expect(registry.contentType).toContain("version=0.0.4");
  });
});
