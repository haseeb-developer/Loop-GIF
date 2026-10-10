"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { User } from "./types";

interface AuthState {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>; refresh: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setUser(await api.me()); } catch { setUser(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<AuthState>(() => ({
    user, loading, refresh,
    login: async (email, password) => setUser(await api.login({ email, password })),
    signup: async (display_name, email, password) => setUser(await api.signup({ display_name, email, password })),
    logout: async () => { await api.logout(); setUser(null); },
  }), [user, loading, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
