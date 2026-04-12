/**
 * Auth Service — myBeez
 *
 * Delegates PIN authentication to tenantService.
 */

import { tenantService } from "./tenantService";

class AuthService {
  async loginWithPin(pin: string, slug?: string) {
    return tenantService.loginWithPin(pin, slug);
  }

  async validateSession(token: string) {
    if (!token) return { success: false };
    return { success: true };
  }
}

export const authService = new AuthService();
