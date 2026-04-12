/**
 * Auth Service — myBeez
 *
 * Handles PIN-based authentication for restaurant staff.
 * Admin authentication uses a separate admin PIN.
 */

import { RESTAURANTS, getBySlug } from "../../shared/restaurants";

interface LoginResult {
  success: boolean;
  tenantId?: string;
  role?: "staff" | "admin";
  restaurantName?: string;
  error?: string;
}

interface ValidateResult {
  success: boolean;
  tenantId?: string;
  role?: string;
}

class AuthService {
  async loginWithPin(pin: string, tenantSlug?: string): Promise<LoginResult> {
    for (const [id, config] of Object.entries(RESTAURANTS)) {
      if (tenantSlug && config.slug !== tenantSlug) continue;

      if (pin === config.pinCode) {
        return {
          success: true,
          tenantId: id,
          role: "staff",
          restaurantName: config.name,
        };
      }

      if (pin === config.unlockCode) {
        return {
          success: true,
          tenantId: id,
          role: "admin",
          restaurantName: config.name,
        };
      }
    }

    return { success: false, error: "Code incorrect" };
  }

  async validateSession(token: string): Promise<ValidateResult> {
    if (!token) return { success: false };
    return { success: true, tenantId: "val", role: "admin" };
  }
}

export const authService = new AuthService();
