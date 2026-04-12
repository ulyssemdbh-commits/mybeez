/**
 * checklistService — myBeez multi-tenant façade.
 *
 * Routes checklist operations to the correct restaurant service
 * based on the tenantId (e.g. "val" → suguvalService, "maillane" → sugumaillaneService).
 *
 * This is the single entry-point used by server/routes/checklist.ts.
 */

import { suguvalService } from "./suguvalService";
import { sugumaillaneService } from "./sugumaillaneService";

// ── Shared interface ─────────────────────────────────────────────────────────

/**
 * The minimal contract every tenant service must satisfy.
 * Both SuguvalService and SugumaillaneService already implement all of these.
 */
export interface IChecklistService {
  // Read
  getCategories(): Promise<any[]>;
  getCategoriesWithItems(): Promise<any[]>;
  getTodayChecks(): Promise<any[]>;
  getDashboardStats(): Promise<any>;
  getWeeklyStats(): Promise<any>;
  getCheckedItemsForToday(): Promise<any[]>;
  getHistory(month?: string): Promise<any[]>;
  getEmailLogs(limit?: number): Promise<any[]>;
  getFutureItems(targetDate: string): Promise<number[]>;

  // Write — checklist
  toggleCheck(itemId: number, isChecked: boolean): Promise<any>;
  resetTodayChecks(): Promise<any>;

  // Write — items & categories
  updateItem(
    itemId: number,
    data: {
      name?: string;
      nameVi?: string | null;
      nameTh?: string | null;
      categoryId?: number;
      sortOrder?: number;
    },
  ): Promise<any>;
  moveItem(itemId: number, direction: "up" | "down"): Promise<any>;
  reorderItems(categoryId: number, orderedIds: number[]): Promise<any>;
  createItem(name: string, categoryId: number): Promise<any>;
  addItem(data: {
    categoryId: number;
    name: string;
    nameVi?: string | null;
    nameTh?: string | null;
  }): Promise<any>;
  deleteItem(itemId: number): Promise<any>;

  updateCategory(
    categoryId: number,
    data: {
      name?: string;
      nameVi?: string | null;
      nameTh?: string | null;
      sortOrder?: number;
    },
  ): Promise<any>;
  reorderCategories(orderedIds: number[]): Promise<any>;
  createCategory(name: string, sheet: "Feuil1" | "Feuil2"): Promise<any>;
  addCategory(name: string, zone?: number): Promise<any>;
  deleteCategory(categoryId: number): Promise<any>;

  // Write — future items
  addFutureItem(itemId: number, targetDate: string): Promise<any>;
  removeFutureItem(itemId: number, targetDate: string): Promise<any>;
  applyFutureItemsForToday(): Promise<any>;

  // Email
  sendDailyEmail(overrideDay?: string, overrideDate?: Date): Promise<{ success: boolean; message: string }>;

  // Init
  initializeFromExcel(): Promise<void>;
}

// ── Tenant registry ──────────────────────────────────────────────────────────

const services: Record<string, IChecklistService> = {
  val: suguvalService as unknown as IChecklistService,
  maillane: sugumaillaneService as unknown as IChecklistService,
};

/**
 * Returns the checklist service for a given tenant ID.
 * Throws if the tenant is not registered.
 */
export function getChecklistService(tenantId: string): IChecklistService {
  const service = services[tenantId];
  if (!service) {
    throw new Error(
      `[checklistService] Unknown tenant: "${tenantId}". ` +
        `Registered tenants: ${Object.keys(services).join(", ")}`,
    );
  }
  return service;
}
