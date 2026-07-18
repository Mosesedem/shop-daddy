#!/usr/bin/env node
/**
 * TanStack Start + Nitro can emit two client-asset manifests:
 *
 *   _tanstack-start-manifest_v.mjs              → empty/dev entry
 *     preloads: ["/@id/virtual:tanstack-start-dev-client-entry"]
 *
 *   _tanstack-start-manifest_v-<hash>.mjs       → real production assets
 *     preloads: ["/assets/index-….js", …]
 *
 * `@tanstack/react-start` is sometimes bundled against the empty file. If that
 * path is used at runtime, browsers request a Vite-dev virtual module, get HTML
 * back, and fail with a MIME-type error — products never hydrate.
 *
 * This post-build step rewrites the empty file to re-export the hashed one so
 * every import path serves production assets.
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = [".vercel/output", ".output", "dist"];
const EMPTY_NAME = "_tanstack-start-manifest_v.mjs";
const DEV_MARKER = "virtual:tanstack-start-dev-client-entry";

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

let patched = 0;
let skipped = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (path.basename(file) !== EMPTY_NAME) continue;

    const dir = path.dirname(file);
    const hashed = fs
      .readdirSync(dir)
      .filter(
        (name) =>
          name.startsWith("_tanstack-start-manifest_v-") &&
          name.endsWith(".mjs"),
      )
      .sort()
      .at(-1);

    if (!hashed) {
      console.warn(
        `[fix-start-manifest] no hashed production manifest next to ${file}`,
      );
      skipped += 1;
      continue;
    }

    const current = fs.readFileSync(file, "utf8");
    if (!current.includes(DEV_MARKER)) {
      console.log(`[fix-start-manifest] already production: ${file}`);
      skipped += 1;
      continue;
    }

    const next = `// Auto-patched by scripts/fix-start-manifest.mjs — do not edit.\nexport { tsrStartManifest } from "./${hashed}";\n`;
    fs.writeFileSync(file, next);
    console.log(`[fix-start-manifest] ${file} → re-export ${hashed}`);
    patched += 1;
  }
}

if (patched === 0 && skipped === 0) {
  console.warn(
    "[fix-start-manifest] no manifest files found under",
    ROOTS.join(", "),
  );
} else {
  console.log(
    `[fix-start-manifest] done (patched=${patched}, skipped=${skipped})`,
  );
}
