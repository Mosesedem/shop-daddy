// PaperDB client — https://www.paperdb.app/docs
// NOTE: This app runs backend-less; the API key is a browser env var
// (VITE_PAPERDB_API_KEY). Use a read/write scoped key per your PaperDB
// dashboard settings. When no key is present, the app falls back to
// in-memory demo data so the UI remains fully explorable.
import { createClient } from "paperdb-js";
import { log } from "./logger";

const apiKey =
  (import.meta.env.VITE_PAPERDB_API_KEY as string | undefined) ?? "";

export const paperdbEnabled = Boolean(apiKey);

export const schema = {
  products: {
    properties: {
      name: { type: "string", required: true },
      slug: { type: "string", required: true },
      price: { type: "number", required: true },
      description: { type: "string" },
      image: { type: "string" },
      category: { type: "string" },
      stock: { type: "number" },
    },
  },
  orders: {
    properties: {
      userId: { type: "string" },
      email: { type: "string", required: true },
      items: { type: "array" },
      total: { type: "number", required: true },
      status: { type: "string", required: true },
      reference: { type: "string" },
      shipping: { type: "object" },
    },
  },
} as const;

// biome-ignore lint/suspicious/noExplicitAny: SDK types depend on schema shape
export const db: any = paperdbEnabled
  ? createClient({ apiKey, schema: schema as any })
  : null;

log.info("paperdb:init", { enabled: paperdbEnabled });
