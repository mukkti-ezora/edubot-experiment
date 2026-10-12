import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearSavedLessons, offlineIdentity, setOfflineOwner } from "./offline";
import { api, ApiError } from "./api";
import type { MeResponse } from "./types";

/** The session, plus whether it was read from this device because the network is gone. */
type Session = MeResponse & { offline?: boolean };

interface AuthState {
  me: MeResponse | null;
  /** True when the app opened without a connection: only saved lessons are available. */
  offline: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  can: (perm: string) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null,
  offline: false,
  loading: true,
  signOut: async () => {},
  can: () => false,
  refresh: async () => {},
});

/** Saved lessons follow the session: kept for its owner, deleted for anyone else or once it ends. */
async function syncSavedLessons(me: MeResponse): Promise<void> {
  try {
    await setOfflineOwner(me);
  } catch {
    /* Offline reading is an enhancement; a storage error never blocks sign-in. */
  }
}

async function loadSession(): Promise<Session | null> {
  try {
    const me = await api<MeResponse>("/api/v1/auth/me");
    await syncSavedLessons(me);
    return me;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status !== 401) throw error;
      await clearSavedLessons().catch(() => undefined);
      return null;
    }
    // No network at all: open on the identity saved with the student's offline lessons, if there is one.
    const saved = await offlineIdentity().catch(() => null);
    if (saved) return { ...saved, offline: true };
    throw error;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery<Session | null>({
    queryKey: ["me"],
    queryFn: loadSession,
    // Public pages (landing, login) never probe the session — no 401 noise in the console.
    enabled: !["/", "/login"].includes(window.location.pathname),
    staleTime: 60_000,
    retry: false,
  });

  // An offline session is only a stand-in: check the real one as soon as the connection is back.
  useEffect(() => {
    if (!data?.offline) return;
    const recheck = () => void refetch();
    window.addEventListener("online", recheck);
    return () => window.removeEventListener("online", recheck);
  }, [data?.offline, refetch]);

  const signOut = useCallback(async () => {
    try {
      await api("/api/v1/auth/logout", { method: "POST", body: "{}" });
    } finally {
      queryClient.clear();
      await clearSavedLessons().catch(() => undefined);
      await refetch();
    }
  }, [queryClient, refetch]);

  const value = useMemo<AuthState>(
    () => ({
      me: data ?? null,
      offline: data?.offline === true,
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
