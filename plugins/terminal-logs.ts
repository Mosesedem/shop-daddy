// Dev-only: mirror browser → Logstack events into the Vite/Node terminal.
// logstack-js pretty-prints to the *current process* console (browser DevTools
// for client code). It cannot write into the Vite terminal from the browser.
import type { Plugin, Connect } from "vite";

const PATH = "/api/client-logs";

type ClientLogEntry = {
  level?: string;
  message?: string;
  meta?: Record<string, unknown>;
};

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Match logstack-js Node pretty-print shape (level + timestamp + message + meta). */
function printLikeLogstack(entry: ClientLogEntry) {
  const level = (entry.level ?? "info").toLowerCase();
  const message = entry.message ?? "";
  const meta = entry.meta ?? {};
  const at =
    typeof meta.at === "string" ? meta.at : new Date().toISOString();
  const ts = at.replace("T", " ").slice(0, 23);
  const levelPad = level.toUpperCase().padEnd(8);
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  // eslint-disable-next-line no-console
  console.log(`${levelPad} ${ts} - ${message}${metaStr}`);
}

export function terminalLogsPlugin(): Plugin {
  return {
    name: "shop-daddy:terminal-logs",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== PATH || req.method !== "POST") {
          next();
          return;
        }
        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw || "{}") as { logs?: unknown };
          const logs = Array.isArray(body.logs) ? body.logs : [];
          for (const item of logs) {
            if (!item || typeof item !== "object") continue;
            printLikeLogstack(item as ClientLogEntry);
          }
          res.statusCode = 204;
          res.end();
        } catch (err) {
          server.config.logger.error(
            `[terminal-logs] ${err instanceof Error ? err.message : String(err)}`,
          );
          res.statusCode = 400;
          res.end("Bad Request");
        }
      });
    },
  };
}
