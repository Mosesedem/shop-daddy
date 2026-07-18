// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only; override preset — default is cloudflare, we pin vercel), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { terminalLogsPlugin } from "./plugins/terminal-logs";

export default defineConfig({
  plugins: [terminalLogsPlugin()],
  // Lovable's wrapper defaults Nitro to `cloudflare-module`. This app is hosted on
  // Vercel — without an explicit vercel preset, SSR ships the Vite *dev* client entry
  // (`/@id/virtual:tanstack-start-dev-client-entry`) and browsers fail with:
  // "Expected a JavaScript-or-Wasm module script but the server responded with MIME type text/html".
  // Nitro auto-detects Vercel when VERCEL=1; the explicit preset keeps local/CI builds correct.
  nitro: {
    preset: "vercel",
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
