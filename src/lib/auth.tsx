import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { db, paperdbEnabled } from "./paperdb";
import { log } from "./logger";

type User = { id: string; email: string; name?: string; isAdmin?: boolean };
type Session = { token?: string; user: User } | null;

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);
const STORAGE = "shop.session";

const ADMIN_EMAILS = ["admin@shop.local"]; // demo admin

function persist(s: Session) {
  if (typeof window === "undefined") return;
  if (s) window.localStorage.setItem(STORAGE, JSON.stringify(s));
  else window.localStorage.removeItem(STORAGE);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE);
      if (raw) {
        const s = JSON.parse(raw) as Session;
        if (s?.user) setUser(s.user);
      }
    } catch (err) {
      log.warn("auth:restore:failed", { error: String(err) });
    } finally {
      setLoading(false);
      log.info("auth:ready");
    }
  }, []);

  async function signIn(email: string, password: string) {
    log.event("auth:signin:attempt", { email });
    try {
      let u: User;
      if (paperdbEnabled) {
        const r = await db.auth.signIn({ email, password });
        u = { id: r.user?.id ?? email, email: r.user?.email ?? email, name: r.user?.name };
        persist({ token: r.session?.token, user: u });
      } else {
        // Local demo fallback
        u = { id: email, email, name: email.split("@")[0] };
        persist({ user: u });
      }
      u.isAdmin = ADMIN_EMAILS.includes(u.email);
      setUser(u);
      log.info("auth:signin:success", { email });
    } catch (err) {
      log.error("auth:signin:failed", { error: String(err) });
      throw err;
    }
  }

  async function signUp(email: string, password: string, name: string) {
    log.event("auth:signup:attempt", { email });
    try {
      let u: User;
      if (paperdbEnabled) {
        const r = await db.auth.signUp({ email, password, name });
        u = { id: r.user?.id ?? email, email, name };
        persist({ token: r.session?.token, user: u });
      } else {
        u = { id: email, email, name };
        persist({ user: u });
      }
      u.isAdmin = ADMIN_EMAILS.includes(u.email);
      setUser(u);
      log.info("auth:signup:success", { email });
    } catch (err) {
      log.error("auth:signup:failed", { error: String(err) });
      throw err;
    }
  }

  async function signOut() {
    log.event("auth:signout");
    try {
      if (paperdbEnabled) await db.auth.signOut();
    } catch (err) {
      log.warn("auth:signout:sdk:failed", { error: String(err) });
    }
    persist(null);
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
