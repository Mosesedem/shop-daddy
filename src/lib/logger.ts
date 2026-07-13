// Unified logger: mirrors every event to console AND Logstack.
// Docs: https://www.logstack.tech/docs
import { createLogStack } from "logstack-js";

const apiKey =
  (import.meta.env.VITE_LOGSTACK_API_KEY as string | undefined) ?? "";

let client: ReturnType<typeof createLogStack> | null = null;
try {
  if (apiKey) {
    client = createLogStack({ apiKey });
  }
} catch (err) {
  console.warn("[logger] Failed to initialize Logstack:", err);
}

type Level = "debug" | "info" | "warn" | "error";
type Meta = Record<string, unknown> | undefined;

const sessionId =
  typeof window !== "undefined"
    ? (window.crypto?.randomUUID?.() ??
      Math.random().toString(36).slice(2))
    : "ssr";

function emit(level: Level, message: string, meta?: Meta) {
  const enriched = {
    sessionId,
    at: new Date().toISOString(),
    ...(meta ?? {}),
  };
  // Always console — user requested total console.log coverage.
  const line = `[${level.toUpperCase()}] ${message}`;
  const fn =
    level === "error" ? console.error
    : level === "warn" ? console.warn
    : level === "debug" ? console.debug
    : console.log;
  fn(line, enriched);

  // Mirror to Logstack when configured.
  if (client) {
    try {
      // logstack-js exposes debug/info/warn/error methods.
      // Docs: https://www.logstack.tech/docs/sdk/javascript
      (client as unknown as Record<Level, (m: string, x?: Meta) => void>)[
        level
      ](message, enriched);
    } catch (err) {
      console.warn("[logger] Logstack emit failed:", err);
    }
  }
}

export const log = {
  debug: (m: string, meta?: Meta) => emit("debug", m, meta),
  info:  (m: string, meta?: Meta) => emit("info", m, meta),
  warn:  (m: string, meta?: Meta) => emit("warn", m, meta),
  error: (m: string, meta?: Meta) => emit("error", m, meta),
  event: (name: string, meta?: Meta) => emit("info", `event:${name}`, meta),
};

// Global error hooks (browser only).
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    log.error("window.error", {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    log.error("unhandledrejection", { reason: String(e.reason) });
  });
  log.info("app:boot", { url: window.location.href });
}
