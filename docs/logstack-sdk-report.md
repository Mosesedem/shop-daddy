# Logstack JS SDK — Console / Terminal Visibility Report

**Date:** 2026-07-15  
**Package:** `logstack-js` **v1.0.2**  
**Reporter context:** Shop Daddy (TanStack Start + Vite SPA/SSR hybrid)  
**Docs referenced:** https://www.logstack.tech/docs/sdk/javascript  
**Goal:** Share findings so Logstack can patch the SDK (and docs) for clearer local console/terminal behavior.

---

## 1. Summary

`logstack-js` correctly ships logs to the Logstack API from both Node (SSR) and the browser. Local **console pretty-printing**, however, is tied to the **current JavaScript runtime’s** `console`:

| Runtime | Where `logToConsole` appears | Typical developer expectation |
|--------|------------------------------|--------------------------------|
| Node / Vite SSR | Vite/Node **terminal** | Terminal |
| Browser (client bundle) | Browser **DevTools Console** | Often also the **dev-server terminal** |

In a Vite + SSR app, most application logs (clicks, React Query, auth, cart, etc.) run **only in the browser**. Developers who watch `pnpm dev` / `vite` see **almost nothing** except module-level SSR logs (e.g. one `paperdb:init` line), while the Logstack dashboard fills correctly. That mismatch feels like “console/local logging is broken,” even when ingest works.

Additionally, environment auto-detection often classifies Vite client/SSR as **`production`**, which **disables** SDK console pretty-print unless `consoleInProduction: true` or `environment: "development"` is set explicitly.

---

## 2. Environment

| Item | Value |
|------|--------|
| App | Client-heavy SPA with light SSR (TanStack Start + Vite 8) |
| SDK | `logstack-js@1.0.2` |
| Dev command | `vite dev --port 3000` |
| API | Default `https://api.logstack.tech` (ingest works) |
| Observed SSR log | `INFO  … - paperdb:init {"sessionId":"ssr",…}` in terminal |
| Observed client logs | Present in Logstack dashboard; **not** in Vite terminal |

---

## 3. What works as designed

From SDK behavior and docs:

1. **Ingest** — `POST {endpoint}/v1/logs` with batching / retries.
2. **Pretty-print** — `logToConsole` when not `silent` and not production/staging (or `consoleInProduction`).
3. **`captureConsole`** (default on) — forwards native `console.*` with `source: "console"`.
4. **Offline queue** — browser `localStorage` when offline.
5. **SSR path** — Node-side `client.info(...)` correctly prints into the Vite terminal.

So remote logging is fine. The gaps are **local visibility**, **environment defaults**, and **docs/expectations** for browser-first apps.

---

## 4. Issues

### Issue A — Browser logs never reach the Node/Vite terminal (P0 product gap)

**Symptom**

```text
$ pnpm dev
…
INFO     2026-07-15 13:28:38.624 - paperdb:init {"sessionId":"ssr",…}
# (no further lines while using the app)
```

Meanwhile the same session produces many client events in the Logstack UI (`app:boot`, `event:products:list`, auth, cart, etc.).

**Root cause**

In `logstack-js` (dist):

- `logToConsole` uses `console.log` / styled `console.log` on **`globalThis`**.
- In the browser, that is DevTools, not the Vite process.
- There is **no** built-in path to mirror browser SDK logs into the dev server’s stdout.

**Why this matters**

Modern full-stack frameworks (Vite, Next client components, TanStack Start, Remix SPA mode, etc.) run most UX/telemetry code in the browser. Developers debug primarily from the **terminal running the dev server**. Docs that say “console and server are independent” and “console output” do not spell out that **browser console ≠ terminal**.

**Workaround apps must invent today**

1. Dev-only Vite middleware on e.g. `POST /api/client-logs`.
2. Browser logger batches POSTs after each `client.info/warn/error`.
3. Middleware prints lines in the same shape as the SDK Node formatter.

That is application glue, not something consumers should need if the SDK advertises first-class local/console logging for JS apps.

---

### Issue B — Environment auto-detect defaults to `production` and silences console (P0 bug / DX)

**Code (v1.0.2)**

```js
detectEnvironment() {
  if (typeof process !== "undefined" && process.env) {
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv === "development" || nodeEnv === "dev") return "development";
    if (nodeEnv === "test") return "test";
    if (nodeEnv === "staging") return "staging";
  }
  return "production"; // ← default when NODE_ENV unset / non-matching
}

shouldLogToConsole() {
  if (this.config.silent) return false;
  if (this.isProductionMode()) return this.config.consoleInProduction; // default false
  return true;
}
```

**Symptom**

- Vite client often has `import.meta.env.DEV === true` but `process.env.NODE_ENV` may be unset or already `"production"` depending on bundling.
- SSR may also not set `NODE_ENV=development`.
- Result: `environment === "production"` → **no** pretty-print, while ingest still works → “logs only on the server, not offline/local.”

**Expected**

- Prefer Vite/`import.meta.env.MODE` / `import.meta.env.DEV` when available.
- Or default to **`development`** when `NODE_ENV` is undefined in browser/dev tools, not production.
- Document that without an explicit `environment`, console may be silent even in local `vite dev`.

---

### Issue C — Double shipping when combining explicit API + `captureConsole` (P1)

**Pattern many apps use**

```ts
function emit(level, message, meta) {
  console.log(message, meta);     // human local output
  client[level](message, meta);   // Logstack
}
```

With default `captureConsole: true`:

1. `console.log` → capture → ingest (`source: "console"`).
2. `client.info` → ingest again (explicit).

**Result:** duplicate events in the dashboard for every wrapped log.

**Expected**

- Docs: warn clearly; recommend **either** `captureConsole` **or** explicit `client.*`, not both with a manual `console.*` mirror.
- Optional: dedupe window (same message + level + metadata hash within N ms), or a `source: "sdk"` flag that capture ignores when already mid-`client.*` (partially addressed by re-entrancy guard for pretty-print, but not for app-level dual emit).

---

### Issue D — Docs under-specify console vs terminal vs offline (P1)

Current messaging:

- “Console and server are independent.”
- “Offline queue” = `localStorage` while offline (browser).
- `consoleInProduction` / `silent` gate **pretty-print**, not ingest.

Missing for real users:

1. Browser pretty-print goes to **DevTools**, not the CLI running Vite/webpack/Next.
2. “Local logging” is **not** a shared terminal stream for hybrid apps.
3. Recommended setup for **Vite / Next / TanStack** (client + server entrypoints, two runtimes, one project key).
4. Explicit `environment: import.meta.env.DEV ? "development" : "production"` recipe.

---

### Issue E — No first-class “dev terminal mirror” option (P2 feature)

Apps that want “everything that hits Logstack also appears in my `vite` terminal” must reimplement:

- HTTP or WebSocket bridge to the dev server  
- Middleware that only exists under `apply: "serve"`  
- Batching + `sendBeacon` on unload  

A small, opt-in SDK or companion package would remove this forever.

---

## 5. Reproduction (minimal)

### 5.1 SSR-only line in terminal (works)

```ts
// loaded on server during SSR
import { createLogStack } from "logstack-js";

const log = createLogStack({
  apiKey: process.env.LOGSTACK_API_KEY!,
  environment: "development",
});

log.info("paperdb:init", { sessionId: "ssr" });
// → appears in Vite terminal ✓
```

### 5.2 Client log (missing from terminal)

```ts
// client component / browser bundle
log.info("app:boot", { url: location.href });
// → Logstack API ✓
// → browser DevTools ✓ (if environment allows console)
// → Vite terminal ✗
```

### 5.3 Silent console under Vite without explicit environment

```ts
// NODE_ENV not "development"
createLogStack({ apiKey: "ls_…" }); // environment → production
// client.info still ships to API, but shouldLogToConsole() is false
```

---

## 6. Requested patches / product changes

### Must-fix (SDK)

| # | Change | Rationale |
|---|--------|-----------|
| 1 | **Smarter `detectEnvironment()`** — honor `import.meta.env.DEV` / `MODE`, treat missing `NODE_ENV` in browser as `development` when `location.hostname` is localhost (or only when clearly non-prod), never silently assume production for local DX | Fixes “API works, console dead” |
| 2 | **Docs callout (Configuration + JS SDK)** — table: Browser → DevTools; Node → process stdout; neither is the other | Sets correct expectations |
| 3 | **Docs recipe** — Vite / SSR hybrid: one client, `environment` from `import.meta.env`, note that terminal only shows server-side `client.*` | Reduces support load |

### Should-fix (SDK or companion)

| # | Change | Rationale |
|---|--------|-----------|
| 4 | **`devTerminal?: { path?: string }` or `mirrorEndpoint?: string`** (browser-only, dev-only) — after ingest/pretty-print decision, `POST` a copy of the log entry to a relative URL; document a 5-line Vite plugin middleware that prints with the same formatter as Node `logToConsole` | Official path for “see client logs in `vite` terminal” |
| 5 | **Export `formatLogLine(entry)`** (or share Node color formatter) so app middleware and SDK never diverge | Consistent local format |
| 6 | **`captureConsole` docs + default guidance** — if using a thin `log.*` wrapper that calls `client.*`, set `captureConsole: false` | Stop duplicate ingest |

### Nice-to-have

| # | Change |
|---|--------|
| 7 | Vite plugin package `@logstack/vite` that installs the terminal middleware automatically when `process.env.NODE_ENV !== "production"` |
| 8 | Optional WebSocket channel via Vite HMR server for lower latency than HTTP batching |
| 9 | Dashboard “source runtime” filter: `browser` vs `node` (from UA / context) for the same `sessionId` |

---

## 7. Suggested API sketch (for maintainers)

```ts
createLogStack({
  apiKey: "ls_…",
  environment: "development", // or improved auto-detect

  /**
   * Browser + development only.
   * After each structured log, POST { logs: [entry] } to this path.
   * Dev server (or @logstack/vite) prints with the official formatter.
   * Default: undefined (off). Example: "/__logstack/dev-console"
   */
  devConsoleEndpoint?: string;

  /**
   * When true (default false), pretty-print even if environment is production/staging.
   * Already exists as consoleInProduction — keep; document interaction with Vite.
   */
  consoleInProduction?: boolean;
});
```

**Vite middleware (what apps do today; could live in `@logstack/vite`):**

```ts
// configureServer
server.middlewares.use("/__logstack/dev-console", async (req, res, next) => {
  if (req.method !== "POST") return next();
  const body = await readJson(req);
  for (const entry of body.logs ?? []) {
    // ideally: import { formatLogLine } from "logstack-js/format"
    console.log(formatLogLine(entry));
  }
  res.statusCode = 204;
  res.end();
});
```

---

## 8. Security notes for any terminal-mirror feature

- **Dev-only** — never enable by default in production builds.
- Bind to same-origin relative path only.
- Optional shared secret header in dev if the endpoint is exposed on LAN.
- Do not accept arbitrary remote hosts as mirror targets from client config without allowlisting.

---

## 9. Impact if unfixed

- Teams assume Logstack “local console” is broken and reimplement bridges.
- Silent console under Vite misconfiguration hides failures until dashboard refresh.
- Duplicate logs from `captureConsole` + wrappers pollute search and alerts.
- Hybrid SSR apps look healthy in the terminal (one init line) while client errors only show remotely.

---

## 10. Appendix — current app workaround (Shop Daddy)

For maintainers comparing approaches:

1. **`plugins/terminal-logs.ts`** — Vite `enforce: "pre"` middleware on `POST /api/client-logs`, prints:

   ```text
   INFO     2026-07-15 13:31:50.000 - event:products:list {…}
   ```

2. **`src/lib/logger.ts`** — thin wrapper:
   - Always `client[level](message, meta)` → Logstack.
   - Browser + `import.meta.env.DEV`: batch POST to `/api/client-logs`.
   - `silent: true` on browser so DevTools is not double-spammed; SSR keeps SDK console.
   - `captureConsole: false` to avoid double ingest.
   - `environment: import.meta.env.DEV ? "development" : "production"`.

3. **Important:** routing the ingest through root `server.ts` **does not work** under `vite dev` (SPA HTML 404). The mirror **must** be a Vite `configureServer` middleware (or equivalent). Any official plugin should use that hook, not only a production server entry.

---

## 11. Asks for the Logstack team

1. Confirm Issue A as **by design** vs **accepted gap**, and if gap → schedule `devConsoleEndpoint` + `@logstack/vite` (or document “not supported”).
2. Ship Issue B environment detection fix in the next `logstack-js` patch.
3. Update Configuration + JS SDK docs for hybrid apps (Issue D).
4. Clarify recommended `captureConsole` usage with application wrappers (Issue C).

Happy to provide a minimal reproduction repo or PR against `packages/logstack-js` if useful.

---

## 12. Contact / stack details (fill if sharing externally)

| Field | Value |
|-------|--------|
| App | Shop Daddy |
| Framework | TanStack Start + Vite 8 + React 19 |
| SDK | logstack-js@1.0.2 |
| Node | (host machine) |
| OS | macOS |

**End of report.**
