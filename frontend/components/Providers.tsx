"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "@/lib/api";
import type { Me } from "@/lib/types";

/* ---------- Toasts */
type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; msg: string; kind: ToastKind }
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

/* ---------- Theme */
type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => undefined });
export const useTheme = () => useContext(ThemeCtx);

/* ---------- Auth */
interface AuthState {
  user: Me | null; loading: boolean; counts: { notifications: number; messages: number };
  login: (email: string, password: string) => Promise<Me>;
  register: (data: { email: string; password: string; name: string; handle: string; role: "creator" | "brand"; company?: string }) => Promise<Me>;
  logout: () => void; setUser: (u: Me) => void; refreshCounts: () => void;
}
const AuthCtx = createContext<AuthState>({
  user: null, loading: true, counts: { notifications: 0, messages: 0 },
  login: async () => { throw new Error("no provider"); }, register: async () => { throw new Error("no provider"); },
  logout: () => undefined, setUser: () => undefined, refreshCounts: () => undefined,
});
export const useAuth = () => useContext(AuthCtx);

export default function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const toast = useCallback((msg: string, kind: ToastKind = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => { setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"); }, []);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const n: Theme = t === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", n === "dark");
      try { localStorage.setItem("cm-theme", n); } catch { /* ignore */ }
      return n;
    });
  }, []);

  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });

  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null); toast("Your session expired. Please log in again.", "info"); });
    if (!getToken()) { setLoading(false); return; }
    api.get<Me>("/auth/me").then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, [toast]);

  const refreshCounts = useCallback(() => {
    Promise.all([api.get<{ count: number }>("/notifications/unread-count"), api.get<{ count: number }>("/conversations/unread-count")])
      .then(([n, m]) => setCounts({ notifications: n.count, messages: m.count })).catch(() => undefined);
  }, []);
  // real-time feel: poll every 5 seconds while logged in and the tab is visible
  useEffect(() => {
    if (!user) { setCounts({ notifications: 0, messages: 0 }); return; }
    refreshCounts();
    const t = setInterval(() => { if (document.visibilityState === "visible") refreshCounts(); }, 5000);
    return () => clearInterval(t);
  }, [user, refreshCounts]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: Me }>("/auth/login", { email, password });
    setToken(r.token); setUser(r.user); return r.user;
  }, []);
  const register = useCallback(async (data: Parameters<AuthState["register"]>[0]) => {
    const r = await api.post<{ token: string; user: Me }>("/auth/register", data);
    setToken(r.token); setUser(r.user); return r.user;
  }, []);
  const logout = useCallback(() => { setToken(null); setUser(null); toast("Logged out", "info"); }, [toast]);

  const auth = useMemo(() => ({ user, loading, counts, login, register, logout, setUser, refreshCounts }), [user, loading, counts, login, register, logout, refreshCounts]);

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      <ToastCtx.Provider value={toast}>
        <AuthCtx.Provider value={auth}>
          {children}
          <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6">
            {toasts.map((t) => (
              <div key={t.id} role="status" className={`pointer-events-auto animate-toastin rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
                t.kind === "error" ? "bg-rose-600 text-white" : t.kind === "info" ? "bg-slate-800 text-white" : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"}`}>
                {t.msg}
              </div>
            ))}
          </div>
        </AuthCtx.Provider>
      </ToastCtx.Provider>
    </ThemeCtx.Provider>
  );
}
