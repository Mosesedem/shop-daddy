import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { requirePaperDB } from "./paperdb";
import { log } from "./logger";
import { envList } from "./env";

type User = {
  id: string;
  email: string;
  name?: string;
  role?: string;
  isAdmin?: boolean;
};
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

const ADMIN_EMAILS = envList("VITE_ADMIN_EMAILS");

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isAdminUser(user: User) {
  return (
    user.isAdmin === true ||
    user.role === "admin" ||
    ADMIN_EMAILS.includes(normalizeEmail(user.email))
  );
}

function mapPaperDBUser(raw: unknown, fallbackEmail: string, fallbackName?: string): User {
  const user = (raw ?? {}) as {
    id?: string;
    _id?: string;
    email?: string;
    name?: string;
    role?: string;
    isAdmin?: boolean;
  };
  const mapped: User = {
    id: user.id ?? user._id ?? fallbackEmail,
    email: user.email ?? fallbackEmail,
    name: user.name ?? fallbackName,
    role: user.role,
    isAdmin: user.isAdmin,
  };
  mapped.isAdmin = isAdminUser(mapped);
  return mapped;
}

function persist(s: Session) {
  if (typeof window === "undefined") return;
  if (s) window.localStorage.setItem(STORAGE, JSON.stringify(s));
  else window.localStorage.removeItem(STORAGE);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      log.event("auth:restore:start");
      const raw = window.localStorage.getItem(STORAGE);
      const stored = raw ? (JSON.parse(raw) as Session) : null;

      try {
        if (stored?.token) {
          requirePaperDB().auth.setSessionToken?.(stored.token);
        }
        const paperUser = await requirePaperDB().auth.getUser();
        if (paperUser) {
          const restored = mapPaperDBUser(paperUser, stored?.user.email ?? "");
          if (!cancelled) setUser(restored);
          persist({ token: stored?.token, user: restored });
          log.info("auth:restore:success", { email: restored.email });
          return;
        }
        if (stored?.user) {
          const restored = {
            ...stored.user,
            isAdmin: isAdminUser(stored.user),
          };
          if (!cancelled) setUser(restored);
          log.warn("auth:restore:using-stored-user", { email: restored.email });
        }
      } catch (err) {
        log.exception("auth:restore:failed", err);
        persist(null);
      } finally {
        if (!cancelled) setLoading(false);
        log.info("auth:ready");
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn(email: string, password: string) {
    log.event("auth:signin:attempt", { email });
    try {
      const r = await requirePaperDB().auth.signIn({ email, password });
      const u = mapPaperDBUser(r.user, email);
      persist({ token: r.session?.token, user: u });
      setUser(u);
      log.info("auth:signin:success", { email });
    } catch (err) {
      log.exception("auth:signin:failed", err, { email });
      throw err;
    }
  }

  async function signUp(email: string, password: string, name: string) {
    log.event("auth:signup:attempt", { email });
    try {
      const r = await requirePaperDB().auth.signUp({ email, password, name });
      const u = mapPaperDBUser(r.user, email, name);
      persist({ token: r.session?.token, user: u });
      setUser(u);
      log.info("auth:signup:success", { email });
    } catch (err) {
      log.exception("auth:signup:failed", err, { email });
      throw err;
    }
  }

  async function signOut() {
    log.event("auth:signout");
    try {
      await requirePaperDB().auth.signOut();
    } catch (err) {
      log.exception("auth:signout:sdk:failed", err);
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
