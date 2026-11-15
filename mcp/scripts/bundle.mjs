#!/usr/bin/env node
// The MCP server as one file (#272): esbuild bundles src/main.ts with its dependencies, the shared content contract and
// the plugin guide (docs/plugins.md, which a checkout reads at start) into a single osct-mcp.mjs that needs Node 22 and
// nothing else – no checkout, no node_modules. The Docker image serves it at /mcp/osct-mcp.mjs (docs/mcp.md), so the
// editor's "Connect an AI agent" guide links a download from its own instance.
//
//   node scripts/bundle.mjs [outfile]          (default: dist/bundle/osct-mcp.mjs)
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(PKG, "..");
const outfile = resolve(process.argv[2] ?? resolve(PKG, "dist/bundle/osct-mcp.mjs"));
const { version } = JSON.parse(readFileSync(resolve(PKG, "package.json"), "utf8"));

await build({
  entryPoints: [resolve(PKG, "src/main.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  legalComments: "eof",
  // a CommonJS dependency that calls require() inside the ESM bundle finds it here
  banner: {
    js: `#!/usr/bin/env node\n// OSCT MCP server ${version} – one file, Node 22 (https://github.com/mandymozart/osct, mcp/)\nimport { createRequire as __osctRequire } from "node:module"; const require = __osctRequire(import.meta.url);`,
  },
  // the docs a checkout reads from disk (src/resources.ts) travel inside the file
  define: { OSCT_BUNDLED_DOCS: JSON.stringify({ "docs/plugins.md": readFileSync(resolve(ROOT, "docs/plugins.md"), "utf8") }) },
  logLevel: "warning",
});
console.log(`osct-mcp ${version} → ${outfile}`);
