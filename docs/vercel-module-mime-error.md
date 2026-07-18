# Vercel “Failed to load module script” (MIME type text/html)

## Symptom

On the live Vercel site:

- The page shell renders (SSR HTML, CSS, images).
- Product cards stay empty (they load only after client hydration).
- Browser console shows:

```text
Failed to load module script: Expected a JavaScript-or-Wasm module script
but the server responded with a MIME type of "text/html".
```

Locally (`pnpm dev`) products load fine.

## Is this PaperDB?

**No.** PaperDB is not involved in this error.

- `paperdb-js` is a normal ESM package bundled by Vite. It does not inject
  `<script type="module">` tags or load WASM/module workers at runtime.
- Product data is fetched **after** the client JS boots (`useQuery` →
  `fetchProducts` → PaperDB). If the client entry never loads, the grid stays
  empty even when PaperDB is healthy.

No PaperDB SDK change is required for this MIME failure.

## Root cause

The app is **TanStack Start + Nitro**, wrapped by
`@lovable.dev/vite-tanstack-config`, which defaults Nitro to:

```ts
defaultPreset: "cloudflare-module"
```

Deploying that Cloudflare-oriented build to **Vercel** produced SSR HTML that
referenced the **Vite dev client entry**:

```html
<script type="module" src="/@id/virtual:tanstack-start-dev-client-entry"></script>
```

That path only works under `vite dev`. On Vercel it 404s / falls through to HTML
(`content-type: text/html`), and the browser rejects it as a module script.

Evidence from the broken live HTML:

- `preloads` / `scripts` used `/@id/virtual:tanstack-start-dev-client-entry`
- `/assets/*.css` and images returned correctly
- `/assets/*.js` and the virtual module URL returned HTML

A correct production manifest looks like:

```js
preloads: ["/assets/index-….js", "/assets/logger-….js"]
scripts: [{ attrs: { type: "module", async: true, src: "/assets/index-….js" } }]
```

## Fix (two layers)

### 1. Nitro preset must be Vercel

Pin Nitro’s preset to Vercel in `vite.config.ts`:

```ts
export default defineConfig({
  plugins: [terminalLogsPlugin()],
  nitro: {
    preset: "vercel",
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
```

### 2. Custom `server.ts` must not use the broken package entry

This app wraps SSR in `server.ts` (Paystack webhook + error page). The wrapper
originally did:

```ts
import("@tanstack/react-start/server-entry")
```

After Nitro bundles that path, it imports the **empty/dev** manifest
(`_tanstack-start-manifest_v.mjs`) even when a correct hashed manifest exists.

Nitro also builds a proper SSR service (`.vercel/output/.../_ssr/ssr.mjs`) that
imports the production manifest. `server.ts` now prefers that:

```ts
const nitroEnvs = globalThis.__nitro_vite_envs__;
if (nitroEnvs?.ssr?.fetch) return nitroEnvs.ssr;
// fallback for vite dev only:
return (await import("@tanstack/react-start/server-entry")).default;
```

### 3. Post-build safety net

`pnpm build` runs `scripts/fix-start-manifest.mjs`, which rewrites the empty
manifest file to re-export the hashed production one so *any* import path is safe.

After rebuild, Vercel output should include:

- `.vercel/output/static/assets/*.js` (client chunks)
- `.vercel/output/functions/__server.func/` (SSR)
- `.vercel/output/config.json` routes that serve `/assets/*` from the filesystem
- `_tanstack-start-manifest_v.mjs` re-exporting `_tanstack-start-manifest_v-*.mjs`

## After redeploy checklist

1. **View source** on the live homepage — client script must be
   `/assets/index-….js`, **not** `/@id/virtual:tanstack-start-dev-client-entry`.
2. **Network tab** — that JS URL must return `content-type: application/javascript`
   (or `text/javascript`), status 200.
3. **Env vars on Vercel** (Project → Settings → Environment Variables):
   - `VITE_PAPERDB_API_KEY` — required for client-side product fetch (products
     load in the browser via React Query, not a server loader).
   - Optionally also `PAPERDB_API_KEY` for server-only paths.
   - Rebuild after adding `VITE_*` vars (they are inlined at build time).
4. If the client boots but products are still empty, check the Network tab for
   calls to `https://api.paperdb.app` and confirm the project was seeded
   (`pnpm seed:paperdb` against the same key).

## Security note

Prefer a **public** PaperDB key (`pdb_pk_…`) for `VITE_PAPERDB_API_KEY`.
Secret keys (`pdb_sk_…`) must not ship in the browser bundle.

## Related (not PaperDB)

| Area | Role |
|------|------|
| TanStack Start SSR manifest | Injects the client `<script type="module">` URL |
| Nitro preset | Must match the host (`vercel` vs `cloudflare-module`) |
| Vercel Build Output API | Expects `.vercel/output/**` from the vercel preset |
| PaperDB | Only runs after client JS loads successfully |
