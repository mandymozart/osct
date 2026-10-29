import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDtsBundle } from "dts-bundle-generator";

/**
 * `plugin-api.d.ts`: the plugin API's types (`engine/src/scene/plugins.ts` and the shared specs it uses) as one
 * declaration file, the module `osct-plugin-api` of a plugin (`import type { PluginApi } from "osct-plugin-api"`).
 * The Code tab gives it to Monaco's TypeScript worker and puts it next to `index.ts` in a download. three.js stays an
 * import (`three`, `three/examples/…`): the editor loads three's own declarations beside it.
 *
 * `node tools/plugin-api/generate.mjs` writes it (the editor build does, `npm run build`); `--check` fails when the
 * checked-in file differs from what the engine's sources give (CI: the file never drifts from the engine).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUTPUT = path.resolve(here, "../../src/lib/plugins/plugin-api.d.ts");

const HEADER = `// The OSCT plugin API – generated from engine/src/scene/plugins.ts by editor/tools/plugin-api/generate.mjs.
// Do not edit: \`npm run plugin-api\` in editor/ writes it again. A plugin imports it as types only:
//   import type { PluginApi } from "osct-plugin-api";
`;

/** The declaration file's text (LF line ends, whatever the platform) */
export const generatePluginApi = () => {
  const [bundle] = generateDtsBundle(
    [{ filePath: path.join(here, "entry.ts"), output: { noBanner: true, exportReferencedTypes: false }, libraries: { importedLibraries: ["three"] } }],
    { preferredConfigPath: path.join(here, "tsconfig.json") },
  );
  return `${HEADER}\n${bundle.replace(/\r\n/g, "\n").trimEnd()}\n`;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = generatePluginApi();
  const relative = path.relative(process.cwd(), OUTPUT);
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== text) {
      console.error(`${relative} is out of date with the engine's plugin API – run \`npm run plugin-api\` in editor/ and commit it.`);
      process.exit(1);
    }
    console.log(`${relative} is up to date.`);
  } else {
    fs.writeFileSync(OUTPUT, text);
    console.log(`wrote ${relative}`);
  }
}
