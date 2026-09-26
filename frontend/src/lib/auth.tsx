import React, { createContext, useContext, useEffect, useState } from "react";
import { router } from "expo-router";
import { usePathname } from "expo-router";
import { api, setAuthToken } from "./api";
import { storage } from "@/src/utils/storage";

export type User = { id: string; name: string; email: string; is_demo: boolean };

const TOKEN_KEY = "sewain_token";

type AuthCtx = {
  user: User | null;
  init: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  demo: () => Promise<void>;
  logout: () => Promise<void>;
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
          setUser(u);
          setToken(t);
        } catch {
          setAuthToken(null);
          await storage.removeItem(TOKEN_KEY);
        }
      }
      setInit(true);
    })();
  }, []);

  useEffect(() => {
    if (!init) return;
    if (!user && pathname !== "/") router.replace("/");
    if (user && pathname === "/") router.replace("/today");
  }, [init, user, pathname]);

  const apply = async (res: { token: string; user: User }) => {
    setAuthToken(res.token);
    await storage.setItem(TOKEN_KEY, res.token);
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
      body: { name, email, password },
    });
    await apply(res);
  };

  const demo = async () => {
    const res = await api<{ token: string; user: User }>("/auth/demo", { method: "POST" });
    await apply(res);
  };

  const logout = async () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    await storage.removeItem(TOKEN_KEY);
    router.replace("/");
  };

  return (
    <Ctx.Provider value={{ user, init, token, login, register, demo, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx) as AuthCtx;
}
