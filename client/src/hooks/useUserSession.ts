/**
 * useUserSession — wraps `GET /api/auth/user/me` for the nominative
 * auth flow. Returns the current user, a loading flag, and helpers to
 * login / logout via the matching POST endpoints.
 *
 * MFA (PR #13): `login` may resolve to `{ kind: "mfa" }`, in which
 * case the caller must collect a TOTP code and call `submitMfaChallenge`
 * (or `submitMfaRecovery`) to promote the half-baked session to a full
 * one. Both return `{ kind: "ok", user }` on success.
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

export interface UserSessionTenant {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
  role: string;
  url: string;
}

interface MeResponse {
  user: UserSessionUser;
  tenants: UserSessionTenant[];
}

export type LoginResult =
  | { kind: "ok"; user: UserSessionUser }
  | { kind: "mfa" };

export type MfaChallengeResult = {
  user: UserSessionUser;
  recoveryCodesRemaining?: number;
};

const ME_KEY = ["/api/auth/user/me"] as const;

async function fetchMe(): Promise<MeResponse | null> {
  const res = await fetch("/api/auth/user/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`me ${res.status}`);
  return (await res.json()) as MeResponse;
}

async function postJson<TBody, TResp>(url: string, body: TBody): Promise<TResp> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `${url} ${res.status}`);
  }
  return (await res.json()) as TResp;
}

export function useUserSession() {
  const queryClient = useQueryClient();

  const meQuery = useQuery<MeResponse | null>({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (input: { email: string; password: string }): Promise<LoginResult> => {
      const data = await postJson<typeof input, { user?: UserSessionUser; mfaRequired?: boolean }>(
        "/api/auth/user/login",
        input,
      );
      if (data.mfaRequired) return { kind: "mfa" };
      if (!data.user) throw new Error("Réponse de connexion invalide");
      return { kind: "ok", user: data.user };
    },
    onSuccess: (result) => {
      if (result.kind === "ok") {
        queryClient.invalidateQueries({ queryKey: ME_KEY });
      }
    },
  });

  const mfaChallengeMutation = useMutation({
    mutationFn: async (input: { code: string }): Promise<MfaChallengeResult> => {
      const data = await postJson<typeof input, MfaChallengeResult>(
        "/api/auth/user/mfa/challenge",
        input,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });

  const mfaRecoveryMutation = useMutation({
    mutationFn: async (input: { code: string }): Promise<MfaChallengeResult> => {
      const data = await postJson<typeof input, MfaChallengeResult>(
        "/api/auth/user/mfa/recovery",
        input,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });

  const mfaCancelMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/user/mfa/cancel", { method: "POST", credentials: "include" });
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
    user: meQuery.data?.user ?? null,
    tenants: meQuery.data?.tenants ?? [],
    isLoading: meQuery.isLoading,
    isLoggedIn: !!meQuery.data,
    refetch: meQuery.refetch,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error?.message ?? null,
    isLoggingIn: loginMutation.isPending,
    submitMfaChallenge: mfaChallengeMutation.mutateAsync,
    mfaChallengeError: mfaChallengeMutation.error?.message ?? null,
    isSubmittingMfaChallenge: mfaChallengeMutation.isPending,
    submitMfaRecovery: mfaRecoveryMutation.mutateAsync,
    mfaRecoveryError: mfaRecoveryMutation.error?.message ?? null,
    isSubmittingMfaRecovery: mfaRecoveryMutation.isPending,
    cancelMfa: mfaCancelMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
  };
}
