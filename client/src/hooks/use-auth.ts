import { useState, useEffect, useCallback } from "react";

interface AuthUser {
  tenantId: number;
  slug: string;
  clientCode: string;
  name: string;
  role: "staff" | "admin";
}

interface AuthState {
  user: AuthUser | null;
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
            slug: data.slug,
            clientCode: data.clientCode,
            name: data.name,
            role: data.role,
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

  useEffect(() => { checkSession(); }, [checkSession]);

  const login = useCallback(async (pin: string, slug?: string) => {
    try {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin, slug }),
      });
      const data = await res.json();
      if (data.success) {
        setState({
          user: {
            tenantId: data.tenantId,
            slug: data.slug,
            clientCode: data.clientCode,
            name: data.name,
            role: data.role,
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

  return { ...state, login, logout, checkSession };
}
