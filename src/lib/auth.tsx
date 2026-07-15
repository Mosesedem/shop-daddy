import { useEffect, useState, type ReactNode } from "react";
import { requirePaperDB } from "./paperdb";
import { log } from "./logger";
import { envList } from "./env";
import { AuthContext, type User } from "./auth-context";

type Session = { token?: string; user: User } | null;
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

function mapPaperDBUser(
  raw: unknown,
  fallbackEmail: string,
  fallbackName?: string,
): User {
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

function readStoredSession(): Session {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/** Live session token: app storage, then PaperDB SDK memory/storage. */
function resolveToken(stored: Session): string | null {
  const auth = requirePaperDB().auth;
  return (
    stored?.token ||
    auth.getSessionToken?.() ||
    auth.getToken?.() ||
    null
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      log.event("auth:restore:start");
      const stored = readStoredSession();
      const auth = requirePaperDB().auth;

      try {
        const token = resolveToken(stored);

        // No session token → not authenticated. Drop any orphaned profile cache.
        if (!token) {
          if (stored?.user) {
            log.warn("auth:restore:stale-user-without-token", {
              email: stored.user.email,
            });
            persist(null);
          }
          return;
        }

        // Seed PaperDB's in-memory + paperdb_session_token before /auth/me.
        auth.setSessionToken?.(token);

        // Validate with API. paperdb-js getUser() returns null on 401 and
        // clears its own token — it does not throw.
        let paperUser = await auth.getUser();

        // One refresh attempt if /me failed but we still had a token.
        if (!paperUser) {
          log.warn("auth:restore:me-failed-trying-refresh");
          // Re-seed in case getUser cleared paperdb storage.
          auth.setSessionToken?.(token);
          const refreshed = await auth.refreshSession?.();
          if (refreshed) {
            paperUser = await auth.getUser();
          }
        }

        if (paperUser) {
          const restored = mapPaperDBUser(
            paperUser,
            stored?.user.email ?? paperUser.email ?? "",
          );
          const liveToken =
            auth.getSessionToken?.() || auth.getToken?.() || token;
          if (!cancelled) setUser(restored);
          persist({ token: liveToken, user: restored });
          log.info("auth:restore:success", { email: restored.email });
          return;
        }

        // /auth/me (and refresh) rejected the session — do NOT trust
        // localStorage user alone. That produced a fake "logged in" UI.
        log.warn("auth:restore:session-invalid", {
          email: stored?.user?.email,
          reason: "auth/me returned 401 or null",
        });
        persist(null);
        if (!cancelled) setUser(null);
      } catch (err) {
        log.exception("auth:restore:failed", err);
        persist(null);
        if (!cancelled) setUser(null);
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
      const token = r.session?.token;
      if (!token) {
        log.error("auth:signin:missing-session-token", { email });
        throw new Error(
          "Sign-in succeeded but no session token was returned. Check PaperDB auth response.",
        );
      }
      // Keep PaperDB + app storage aligned.
      requirePaperDB().auth.setSessionToken?.(token);
      persist({ token, user: u });
      setUser(u);
      log.info("auth:signin:success", {
        email,
        sessionId: r.session?.id,
        expiresAt: r.session?.expiresAt,
      });
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
      const token = r.session?.token;
      if (!token) {
        log.error("auth:signup:missing-session-token", { email });
        throw new Error(
          "Sign-up succeeded but no session token was returned. Check PaperDB auth response.",
        );
      }
      requirePaperDB().auth.setSessionToken?.(token);
      persist({ token, user: u });
      setUser(u);
      log.info("auth:signup:success", {
        email,
        sessionId: r.session?.id,
        expiresAt: r.session?.expiresAt,
      });
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
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
