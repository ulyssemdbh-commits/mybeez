/**
 * Realtime Sync — myBeez (SSE)
 *
 * Server-Sent Events for live updates between connected clients (e.g. tablets).
 * When a user toggles a checklist item, all clients of the same tenant see it
 * instantly.
 */

import type { Express, Request, Response } from "express";
import { resolveTenant } from "../middleware/tenant";
import { requireUser, requireRole } from "../middleware/auth";

// SSE = read-only feed; any tenant role (incl. viewer) may listen.
const SSE_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;

interface SSEClient {
  id: string;
  tenantId: string;
  res: Response;
  connectedAt: number;
}

const clients: Map<string, SSEClient> = new Map();
let clientIdCounter = 0;

export function registerSSERoutes(app: Express): void {
  app.get("/api/:tenant/events", resolveTenant, requireUser, requireRole(...SSE_ROLES), (req: Request, res: Response) => {
    // tenantId here is the tenant slug (used as the broadcast key by emitChecklistUpdated).
    // After resolveTenant, req.tenant is guaranteed populated.
    const tenantId = req.tenant!.slug;
    const clientId = `sse-${++clientIdCounter}`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

    clients.set(clientId, {
      id: clientId,
      tenantId,
      res,
      connectedAt: Date.now(),
    });

    console.log(`[SSE] Client ${clientId} connected for tenant ${tenantId} (total: ${clients.size})`);

    const keepAlive = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        clearInterval(keepAlive);
        clients.delete(clientId);
      }
    }, 30000);

    req.on("close", () => {
      clearInterval(keepAlive);
      clients.delete(clientId);
      console.log(`[SSE] Client ${clientId} disconnected (total: ${clients.size})`);
    });
  });
}

function broadcast(tenantId: string, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients.values()) {
    if (client.tenantId === tenantId) {
      try {
        client.res.write(payload);
      } catch {
        clients.delete(client.id);
      }
    }
  }
}

export function emitChecklistUpdated(tenantId: string): void {
  broadcast(tenantId, "checklist_updated", { timestamp: Date.now() });
}

export function getSseStats(): { connected: number; byTenant: Record<string, number> } {
  const byTenant: Record<string, number> = {};
  for (const client of clients.values()) {
    byTenant[client.tenantId] = (byTenant[client.tenantId] || 0) + 1;
  }
  return { connected: clients.size, byTenant };
}
