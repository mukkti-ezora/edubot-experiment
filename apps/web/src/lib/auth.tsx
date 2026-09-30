import { createContext, useCallback, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { MeResponse } from "./types";

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  signOut: () => Promise<void>;
  can: (perm: string) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null,
  loading: true,
  signOut: async () => {},
  can: () => false,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery<MeResponse | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<MeResponse>("/api/v1/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    // Public pages (landing, login) never probe the session — no 401 noise in the console.
    enabled: !["/", "/login"].includes(window.location.pathname),
    staleTime: 60_000,
    retry: false,
  });

  const signOut = useCallback(async () => {
    try {
      await api("/api/v1/auth/logout", { method: "POST", body: "{}" });
    } finally {
      queryClient.clear();
      await refetch();
    }
  }, [queryClient, refetch]);

  const value = useMemo<AuthState>(
    () => ({
      me: data ?? null,
      loading: isLoading,
      signOut,
      can: (perm: string) => (data?.permissions ?? []).includes(perm),
      refresh: async () => {
        await refetch();
      },
    }),
    [data, isLoading, signOut, refetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
