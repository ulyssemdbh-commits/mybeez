/**
 * Realtime Sync — myBeez (SSE)
 *
 * Server-Sent Events for live checklist updates across tablets.
 * When a staff member toggles an item, all connected clients see it instantly.
 */

import type { Express, Request, Response } from "express";

interface SSEClient {
  id: string;
  tenantId: string;
  res: Response;
  connectedAt: number;
}

const clients: Map<string, SSEClient> = new Map();
let clientIdCounter = 0;

export function registerSSERoutes(app: Express): void {
  app.get("/api/:tenant/events", (req: Request, res: Response) => {
    const tenantId = req.params.tenant;
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

    req.on("close", () => {
      clients.delete(clientId);
      console.log(`[SSE] Client ${clientId} disconnected (total: ${clients.size})`);
    });

    const keepAlive = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        clearInterval(keepAlive);
        clients.delete(clientId);
      }
    }, 30000);

    req.on("close", () => clearInterval(keepAlive));
  });
}

function broadcast(tenantId: string, event: string, data: any): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, client] of clients) {
    if (client.tenantId === tenantId || client.tenantId === "all") {
      try {
        client.res.write(payload);
      } catch {
        clients.delete(client.id);
      }
    }
  }
}

export function emitSuguChecklistUpdated(tenantId: string = "val"): void {
  broadcast(tenantId, "checklist_updated", { timestamp: Date.now() });
}

export function emitSuguPurchasesUpdated(tenantId: string = "val"): void {
  broadcast(tenantId, "purchases_updated", { timestamp: Date.now() });
}

export function emitSuguExpensesUpdated(tenantId: string = "val"): void {
  broadcast(tenantId, "expenses_updated", { timestamp: Date.now() });
}

export function emitSuguBankUpdated(tenantId: string = "val"): void {
  broadcast(tenantId, "bank_updated", { timestamp: Date.now() });
}

export function emitSuguCashUpdated(tenantId: string = "val"): void {
  broadcast(tenantId, "cash_updated", { timestamp: Date.now() });
}

export function emitSuguFilesUpdated(tenantId: string = "val"): void {
  broadcast(tenantId, "files_updated", { timestamp: Date.now() });
}

export function emitSuguEmployeesUpdated(tenantId: string = "val"): void {
  broadcast(tenantId, "employees_updated", { timestamp: Date.now() });
}

export function emitSuguPayrollUpdated(tenantId: string = "val"): void {
  broadcast(tenantId, "payroll_updated", { timestamp: Date.now() });
}

export function emitSuguAbsencesUpdated(tenantId: string = "val"): void {
  broadcast(tenantId, "absences_updated", { timestamp: Date.now() });
}

export function getSseStats(): { connected: number; byTenant: Record<string, number> } {
  const byTenant: Record<string, number> = {};
  for (const [, client] of clients) {
    byTenant[client.tenantId] = (byTenant[client.tenantId] || 0) + 1;
  }
  return { connected: clients.size, byTenant };
}
