/**
 * Junction table ops for `user_tenants` (M2M user ↔ tenant + role).
 *
 * Roles are validated against TENANT_ROLES at the API boundary
 * (route Zod schema) — this service trusts its inputs.
 */

import { db } from "../../db";
import {
  userTenants,
  type UserTenant,
  type TenantRole,
} from "../../../shared/schema/users";
import { eq, and } from "drizzle-orm";

class UserTenantService {
  /**
   * Links a user to a tenant with the given role. Idempotent: if the
   * link already exists, the role is updated in place (UPSERT).
   * `acceptedAt` is set immediately for direct admin add (no invite
   * flow); the invite path will land in a later PR.
   */
  async upsert(
    userId: number,
    tenantId: number,
    role: TenantRole,
    invitedByUserId: number | null = null,
  ): Promise<UserTenant> {
    const [existing] = await db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)));

    if (existing) {
      const [updated] = await db
        .update(userTenants)
        .set({ role, updatedAt: new Date() })
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(userTenants)
      .values({
        userId,
        tenantId,
        role,
        invitedByUserId,
        acceptedAt: new Date(),
      })
      .returning();
    return created;
  }

  async getRole(userId: number, tenantId: number): Promise<TenantRole | null> {
    const [row] = await db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)));
    if (!row) return null;
    return row.role as TenantRole;
  }

  async listForUser(userId: number): Promise<UserTenant[]> {
    return db.select().from(userTenants).where(eq(userTenants.userId, userId));
  }

  async listForTenant(tenantId: number): Promise<UserTenant[]> {
    return db.select().from(userTenants).where(eq(userTenants.tenantId, tenantId));
  }

  async remove(userId: number, tenantId: number): Promise<void> {
    await db
      .delete(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)));
  }
}

export const userTenantService = new UserTenantService();
