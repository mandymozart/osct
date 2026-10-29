#!/usr/bin/env node
// Starts the OSCT MCP server from its TypeScript sources: esbuild bundles src/main.ts with the shared content contract
// into dist/osct-mcp.mjs on every start (about a tenth of a second; the dependencies stay in node_modules), then runs
// it – nothing to build by hand, the server is always the checkout's current code. stdio is passed through: it is the
// MCP channel, logs go to stderr.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(PKG, "dist/osct-mcp.mjs");

await build({
  entryPoints: [resolve(PKG, "src/main.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: "inline",
  logLevel: "warning",
});
await import(pathToFileURL(outfile).href);
