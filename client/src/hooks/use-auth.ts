/**
 * Auth Hook — myBeez
 *
 * Real PIN-based authentication for restaurant staff.
 * Checks session status on mount and provides login/logout methods.
 */

import { useState, useEffect, useCallback } from "react";

interface User {
  tenantId: string;
  role: "staff" | "admin";
  restaurantName: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = await res.json();
      if (data.authenticated) {
        setState({
          user: {
            tenantId: data.tenantId,
            role: data.role,
            restaurantName: data.restaurantName,
          },
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        setState({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      setState({ user: null, isAuthenticated: false, isLoading: false });
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(async (pin: string, tenant?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin, tenant }),
      });

      const data = await res.json();
      if (data.success) {
        setState({
          user: {
            tenantId: data.tenantId,
            role: data.role,
            restaurantName: data.restaurantName,
          },
          isAuthenticated: true,
          isLoading: false,
        });
        return { success: true };
      }
      return { success: false, error: data.error || "Code incorrect" };
    } catch {
      return { success: false, error: "Erreur de connexion" };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }, []);

  return {
    ...state,
    login,
    logout,
    checkSession,
  };
}
