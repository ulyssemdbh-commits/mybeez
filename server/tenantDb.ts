/**
 * Tenant DB — myBeez
 *
 * Returns a tenant-scoped database connection.
 * In the current single-DB architecture, all tenants share the same DB
 * but use prefixed table names (suguval_*, sugumaillane_*).
 *
 * This module exists to support future multi-DB architecture.
 */

import { db } from "./db";

export function getTenantDb(tenantId: string) {
  return db;
}
