import React, { createContext, useContext, useEffect, useState } from "react";
import { router, usePathname } from "expo-router";
import { api, markAuthReady, setAuthToken } from "./api";
import { storage } from "@/src/utils/storage";
import { queryClient } from "@/src/query-client";

export type User = { id: string; name: string; email: string; is_demo: boolean; plan: "free" | "premium" | "demo"; timezone?: string };
export type Session = { token: string; user: User };

// Pages anyone can open without an account.
export const PUBLIC_PATHS = ["/", "/privasi", "/ketentuan", "/reset"];

const ZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"];
function deviceZone(): string | undefined {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return ZONES.includes(z) ? z : undefined;
  } catch {
    return undefined;
  }
}

const TOKEN_KEY = "sewain_token";
const USER_KEY = "sewain_user"; // last known profile, so the installed app still opens offline

type AuthCtx = {
  user: User | null;
  init: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  demo: () => Promise<void>;
  logout: () => Promise<void>;
  applySession: (res: Session) => Promise<void>;
  setUserProfile: (u: User) => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [init, setInit] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    (async () => {
      const t = await storage.getItem(TOKEN_KEY, null);
      if (t) {
        setAuthToken(t);
        try {
          const u = await api<User>("/me");
          await storage.setItem(USER_KEY, JSON.stringify(u));
          setUser(u);
          setToken(t);
        } catch (e: any) {
          const cached = e?.status === 401 ? null : await storage.getItem(USER_KEY, null);
          if (typeof cached === "string") {
            // Offline or server waking up: keep the session instead of logging out.
            setUser(JSON.parse(cached));
            setToken(t);
          } else {
            setAuthToken(null);
            await storage.removeItem(TOKEN_KEY);
            await storage.removeItem(USER_KEY);
          }
        }
      }
      markAuthReady();
      setInit(true);
    })();
  }, []);

  useEffect(() => {
    if (!init) return;
    if (!user && !PUBLIC_PATHS.includes(pathname)) router.replace("/");
    if (user && pathname === "/") router.replace("/today");
  }, [init, user, pathname]);

  const apply = async (res: { token: string; user: User }) => {
    queryClient.clear();
    setAuthToken(res.token);
    await storage.setItem(TOKEN_KEY, res.token);
    await storage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
    setToken(res.token);
    router.replace("/today");
  };

  const login = async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    await apply(res);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: { name, email, password, timezone: deviceZone() },
    });
    await apply(res);
  };

  const demo = async () => {
    const res = await api<{ token: string; user: User }>("/auth/demo", { method: "POST" });
    await apply(res);
  };

  const setUserProfile = async (u: User) => {
    await storage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  };

  const logout = async () => {
    queryClient.clear();
    setAuthToken(null);
    setToken(null);
    setUser(null);
    await storage.removeItem(TOKEN_KEY);
    await storage.removeItem(USER_KEY);
    router.replace("/");
  };

  return (
    <Ctx.Provider value={{ user, init, token, login, register, demo, logout, applySession: apply, setUserProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx) as AuthCtx;
}
