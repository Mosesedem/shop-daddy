import "./src/lib/error-capture";

import { consumeLastCapturedError } from "./src/lib/error-capture";
import { renderErrorPage } from "./src/lib/error-page";
import { log } from "./src/lib/logger";
import { handlePaystackWebhook } from "./src/lib/paystack-webhook";

type ServerEntry = {
  fetch: (
    request: Request,
    env?: unknown,
    ctx?: unknown,
  ) => Promise<Response> | Response;
};

type NitroViteEnvs = {
  ssr?: ServerEntry;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

/**
 * Resolve the TanStack Start SSR handler.
 *
 * Nitro's multi-env build embeds the *production* client asset manifest in the
 * `ssr` service (real `/assets/index-*.js` URLs). Prefer that when available.
 *
 * Falling back to `@tanstack/react-start/server-entry` is required for `vite dev`,
 * but that package path is bundled against an empty/dev manifest
 * (`/@id/virtual:tanstack-start-dev-client-entry`) — which breaks production with:
 * "Failed to load module script … MIME type of text/html".
 */
async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = resolveServerEntry();
  }
  return serverEntryPromise;
}

async function resolveServerEntry(): Promise<ServerEntry> {
  const nitroEnvs = (
    globalThis as typeof globalThis & {
      __nitro_vite_envs__?: NitroViteEnvs;
    }
  ).__nitro_vite_envs__;

  if (nitroEnvs?.ssr && typeof nitroEnvs.ssr.fetch === "function") {
    log.info("ssr:entry", { source: "nitro-ssr-env" });
    return nitroEnvs.ssr;
  }

  log.info("ssr:entry", { source: "tanstack-server-entry" });
  const m = await import("@tanstack/react-start/server-entry");
  return (m.default ?? m) as ServerEntry;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  log.exception(
    "ssr:h3-swallowed-error",
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`),
    { status: response.status },
  );
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as {
      unhandled?: unknown;
      message?: unknown;
    };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/paystack/webhook") {
        return await handlePaystackWebhook(request);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      log.exception("ssr:fetch:failed", error, { url: request.url });
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
