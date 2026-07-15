// Logstack SDK for shipping + console. Docs:
// https://www.logstack.tech/docs/sdk/javascript
//
// SSR: SDK pretty-prints into the Vite/Node terminal.
// Browser: SDK ships to Logstack; in dev we also POST a copy to
// /api/client-logs so the same lines appear in the Vite terminal
// (logstack-js cannot print browser logs into the Node process).
import { createLogStack, type LogStackClient } from "logstack-js";
import { env } from "./env";

const apiKey = env("LOGSTACK_API_KEY") || env("VITE_LOGSTACK_API_KEY");
const isBrowser = typeof window !== "undefined";
const isDev =
  typeof import.meta !== "undefined" && import.meta.env?.DEV === true;

// Avoid production console-gating when Vite is in DEV but NODE_ENV is unset.
const environment = isDev ? "development" : "production";

let client: LogStackClient | null = null;

try {
  if (apiKey) {
    client = createLogStack({
      apiKey,
      environment,
      // Browser: silence SDK pretty-print (shows in DevTools). Terminal mirror
      // handles local visibility. Server: keep SDK console (Vite terminal).
      silent: isBrowser,
      // We call client.* explicitly; skip double-ingest of console.* noise.
      captureConsole: false,
    });
  } else {
    client = createLogStack({
      apiKey: "local",
      environment,
      disabled: true,
      silent: isBrowser,
      captureConsole: false,
    });
  }
} catch (err) {
  if (!isBrowser) console.warn("[logger] Failed to initialize Logstack:", err);
}

type Level = "debug" | "info" | "warn" | "error";
type Meta = Record<string, unknown> | undefined;

type QueuedLog = {
  level: Level;
  message: string;
  meta: Record<string, unknown>;
};

const sessionId = isBrowser
  ? (window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))
  : "ssr";

function withSession(meta?: Meta): Record<string, unknown> {
  return {
    sessionId,
    at: new Date().toISOString(),
    ...(meta ?? {}),
  };
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        error.cause instanceof Error
          ? serializeError(error.cause)
          : error.cause,
    };
  }
  return { message: String(error), value: error };
}

// --- browser → Vite terminal (dev only) -------------------------------------

const CLIENT_LOGS_PATH = "/api/client-logs";
const FLUSH_MS = 40;
const queue: QueuedLog[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushClientQueue(opts?: { beacon?: boolean }) {
  flushTimer = null;
  if (!queue.length || !isBrowser) return;
  const batch = queue.splice(0, queue.length);
  const body = JSON.stringify({ logs: batch });
  try {
    if (
      opts?.beacon &&
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      if (
        navigator.sendBeacon(
          CLIENT_LOGS_PATH,
          new Blob([body], { type: "application/json" }),
        )
      ) {
        return;
      }
    }
    void fetch(CLIENT_LOGS_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort
  }
}

function mirrorToTerminal(
  level: Level,
  message: string,
  meta: Record<string, unknown>,
) {
  if (!isBrowser || !isDev) return;
  queue.push({ level, message, meta });
  if (flushTimer == null) {
    flushTimer = setTimeout(flushClientQueue, FLUSH_MS);
  }
}

if (isBrowser && isDev) {
  const onUnload = () => {
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushClientQueue({ beacon: true });
  };
  window.addEventListener("pagehide", onUnload);
  window.addEventListener("beforeunload", onUnload);
}

// --- emit -------------------------------------------------------------------

function emit(level: Level, message: string, meta?: Meta) {
  const enriched = withSession(meta);

  // 1) Logstack (server shipping + SSR console pretty-print)
  if (client) {
    try {
      client[level](message, enriched);
    } catch (err) {
      if (!isBrowser) console.warn("[logger] Logstack emit failed:", err);
    }
  }

  // 2) Dev: also print browser events in the Vite terminal
  mirrorToTerminal(level, message, enriched);
}

export const log = {
  debug: (m: string, meta?: Meta) => emit("debug", m, meta),
  info: (m: string, meta?: Meta) => emit("info", m, meta),
  warn: (m: string, meta?: Meta) => emit("warn", m, meta),
  error: (m: string, meta?: Meta) => emit("error", m, meta),
  event: (name: string, meta?: Meta) => emit("info", `event:${name}`, meta),
  exception: (m: string, error: unknown, meta?: Meta) =>
    emit("error", m, { ...(meta ?? {}), error: serializeError(error) }),
};

if (isBrowser) {
  window.addEventListener("error", (e) => {
    log.exception("window.error", e.error ?? e.message, {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    log.exception("unhandledrejection", e.reason);
  });
  log.info("app:boot", { url: window.location.href });
}
