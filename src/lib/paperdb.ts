import { createClient } from "paperdb-js";
import { env } from "./env";
import { log } from "./logger";
import { schema } from "./paperdb-schema";

type PaperDBClient = ReturnType<typeof createClient<typeof schema>>;

let cachedApiKey = "";
let cachedClient: PaperDBClient | null = null;

export function getPaperDBApiKey() {
  return env("PAPERDB_API_KEY") || env("VITE_PAPERDB_API_KEY");
}

export function paperdbEnabled() {
  return Boolean(getPaperDBApiKey());
}

export function getPaperDB() {
  const apiKey = getPaperDBApiKey();
  if (!apiKey) return null;
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedApiKey = apiKey;
    cachedClient = createClient({ apiKey, schema });
    log.info("paperdb:client:ready", {
      hasServerKey: Boolean(env("PAPERDB_API_KEY")),
    });
  }
  return cachedClient;
}

export function requirePaperDB() {
  const client = getPaperDB();
  if (!client) {
    log.error("paperdb:missing-api-key");
    throw new Error(
      "PaperDB is not configured. Set PAPERDB_API_KEY or VITE_PAPERDB_API_KEY.",
    );
  }
  return client;
}

log.info("paperdb:init", {
  enabled: paperdbEnabled(),
  hasServerKey: Boolean(env("PAPERDB_API_KEY")),
});
