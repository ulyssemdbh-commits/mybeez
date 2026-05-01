/**
 * useUserSession — wraps `GET /api/auth/user/me` for the nominative
 * auth flow (PR #12). Returns the current user, a loading flag, and
 * helpers to login / logout via the matching POST endpoints.
 *
 * Distinct from `use-auth` (legacy PIN-based, lives in /hooks).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface UserSessionUser {
  id: number;
  email: string;
  fullName: string | null;
  locale: string;
  emailVerified: boolean;
  isSuperadmin: boolean;
}

const ME_KEY = ["/api/auth/user/me"] as const;

async function fetchMe(): Promise<UserSessionUser | null> {
  const res = await fetch("/api/auth/user/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`me ${res.status}`);
  const data = (await res.json()) as { user: UserSessionUser };
  return data.user;
}

export function useUserSession() {
  const queryClient = useQueryClient();

  const meQuery = useQuery<UserSessionUser | null>({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const res = await fetch("/api/auth/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `login ${res.status}`);
      }
      const data = (await res.json()) as { user: UserSessionUser };
      return data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/user/logout", { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
    },
  });

  return {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    isLoggedIn: !!meQuery.data,
    refetch: meQuery.refetch,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error?.message ?? null,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutateAsync,
  };
}
