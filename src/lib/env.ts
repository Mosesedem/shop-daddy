type RuntimeEnv = Record<string, string | undefined>;

declare global {
  // Nitro's Cloudflare runtime stores request env here before invoking handlers.
  var __env__: RuntimeEnv | undefined;
}

function viteEnv(): RuntimeEnv {
  try {
    return (import.meta.env ?? {}) as RuntimeEnv;
  } catch {
    return {};
  }
}

function nodeEnv(): RuntimeEnv {
  if (typeof process === "undefined") return {};
  return process.env;
}

export function env(name: string): string {
  return globalThis.__env__?.[name] ?? nodeEnv()[name] ?? viteEnv()[name] ?? "";
}

export function envList(name: string): string[] {
  return env(name)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}
