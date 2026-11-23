import { PLUGIN_API_VERSION, type PluginRegistrations } from "@engine/types";
import type { PluginRegistrySnapshot } from "@engine/scene/plugins";
import { PLUGIN_BUNDLE_WARN_BYTES, PLUGIN_ENTRY, type PluginFile } from "@shared/types/plugins";
import type { PluginSources, PluginTypeProblem } from "@shared/plugins/type-check";
import type { CompileResult } from "#lib/plugins/compile.js";

/**
 * What a publish carries of the Code tab (#78): every saved plugin of the experience, its files bundled as **Run** bundles
 * them (#352: one file transpiled, several bundled by esbuild-wasm), with the plugin API it was written against and, where
 * it ran on the stage in this session, the specs that run registered. The API puts each into the published version and
 * declares it; readers load it from the CDN like a compiled plugin.
 *
 * Before that, every file is **type-checked** (#352, the type-check half of #266 – the shared check, #366): a type error
 * stops the publish with its plugin, file and line, as the content build stops, and the problems go with it (the dialog
 * offers a known fault's Repair). A bundle above 256 KB is a warning, never a stop.
 */

/** One carried plugin (`POST /editor/experiences/{id}/publish` → `plugins[]`) */
export interface PublishedPlugin {
  id: string;
  /** The module: the bundled files, `export const register` */
  code: string;
  /** `PLUGIN_API_VERSION` */
  api: string;
  /** The specs a stage run registered, as the content declares them; absent when the source has not run here */
  registered?: PluginRegistrations;
}

export type CarriedPlugins = { plugins: PublishedPlugin[]; warnings: string[] } | { error: string; problems?: PluginTypeProblem[] };

type SnapshotEntry = PluginRegistrySnapshot["plugins"][string];

/**
 * A stage run's registrations as the content declares them: its material layers among its components, its looks only
 * when it has some (as the content build writes them)
 */
export const declaredRegistrations = (entry: SnapshotEntry): PluginRegistrations => ({
  components: { ...entry.components, ...entry.layers },
  nodeTypes: { ...entry.nodeTypes },
  passes: { ...entry.passes },
  materials: { ...entry.materials },
  textures: { ...entry.textures },
  ...(Object.keys(entry.appearances ?? {}).length ? { appearances: { ...entry.appearances } } : {}),
  ...(Object.keys(entry.cardLooks ?? {}).length ? { cardLooks: { ...entry.cardLooks } } : {}),
});

/** Type problems as the publish says them: the first, and how many more */
export const typeProblemText = (problems: readonly PluginTypeProblem[]): string => {
  const [first] = problems;
  const more = problems.length > 1 ? ` (and ${problems.length - 1} more)` : "";
  return `The plugin ${first.plugin} has a type error in ${first.file} line ${first.line}: ${first.message}${more} – fix it in the Code tab.`;
};

/**
 * The plugins a publish carries: every saved plugin type-checked (`typeCheck`, when given), then bundled, in the order
 * given. The first type error or build error stops it – its plugin, file, line and message, so the publish step can say
 * what to fix in the Code tab.
 */
export const carriedPlugins = async (
  sources: readonly PluginSources[],
  build: (files: readonly PluginFile[], name: string) => Promise<CompileResult>,
  registry: PluginRegistrySnapshot | null,
  typeCheck?: (sources: readonly PluginSources[]) => Promise<PluginTypeProblem[]>,
): Promise<CarriedPlugins> => {
  if (typeCheck && sources.length) {
    const problems = await typeCheck(sources);
    if (problems.length) return { error: typeProblemText(problems), problems };
  }
  const plugins: PublishedPlugin[] = [];
  const warnings: string[] = [];
  for (const { id, files } of sources) {
    const result = await build(files, id);
    if ("error" in result) {
      const { file, line, message } = result.error;
      const where = `${file && file !== PLUGIN_ENTRY ? ` in ${file}` : ""}${line ? ` (line ${line})` : ""}`;
      return { error: `The plugin ${id} does not build${where}: ${message} – fix it in the Code tab.` };
    }
    const bytes = new TextEncoder().encode(result.code).length;
    if (bytes > PLUGIN_BUNDLE_WARN_BYTES) warnings.push(`${id} is ${Math.round(bytes / 1024)} KB bundled – readers download it with the AR scene`);
    const ran = registry?.plugins[id];
    plugins.push({ id, code: result.code, api: PLUGIN_API_VERSION, ...(ran ? { registered: declaredRegistrations(ran) } : {}) });
  }
  return { plugins, warnings };
};
