/**
 * Plugins: the book's own code as content (content schema 2.4, agents/research/2026-10-29-code-in-the-editor.md).
 * A plugin is a folder `plugins/<id>/` of the content source with an `index.ts` that exports `register(api)`; the
 * content build type-checks and bundles it into `plugins/<id>/plugin.js` of the build output and declares it here.
 * The engine loads every declared plugin before it builds the first spread and hands it the plugin API
 * (`engine/src/scene/plugins.ts`): registries for components and material layers, the app's three.js.
 *
 * The API is versioned apart from the content schema: `PLUGIN_API_VERSION` MAJOR.MINOR – a plugin built against
 * another MAJOR is not loaded (logged); MINOR adds. 1.1 added `api.events`, `api.vars`, `api.progress`, `api.spread`,
 * the component context's `children` and the hook `onUnlocked`.
 */

export const PLUGIN_API_VERSION = "1.1";

/** A plugin as the game configuration declares it */
export interface PluginData {
  /** The folder's name: letters, digits, `-` */
  id: string;
  /** The compiled module (`/assets/content/plugins/<id>/plugin.js`) */
  src: string;
  /** The plugin API it was built against (`PLUGIN_API_VERSION`) */
  api: string;
}

export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/** Problems of a configuration's `plugins` list, as "<path>: <message>" */
export const pluginProblems = (raw: unknown, path = "plugins"): string[] => {
  if (!Array.isArray(raw)) return [`${path}: expected a list of plugins`];
  const problems: string[] = [];
  const ids = new Set<string>();
  raw.forEach((plugin, i) => {
    const at = `${path}[${i}]`;
    if (typeof plugin !== "object" || plugin === null || Array.isArray(plugin)) {
      problems.push(`${at}: expected { id, src, api }`);
      return;
    }
    const p = plugin as Record<string, unknown>;
    if (typeof p.id !== "string" || !PLUGIN_ID_PATTERN.test(p.id)) problems.push(`${at}.id: expected a plugin id (letters, digits, -)`);
    else if (ids.has(p.id)) problems.push(`${at}.id: duplicate plugin id "${p.id}"`);
    else ids.add(p.id);
    if (typeof p.src !== "string" || !p.src.endsWith(".js")) problems.push(`${at}.src: expected the compiled module (…/plugin.js)`);
    if (typeof p.api !== "string" || !/^\d+\.\d+$/.test(p.api)) problems.push(`${at}.api: expected the plugin API version "MAJOR.MINOR"`);
  });
  return problems;
};

/** Can this engine run a plugin built against `api`? The same MAJOR (RULES #10's rule, for the API) */
export const pluginApiCompatible = (api: string): boolean => api.split(".")[0] === PLUGIN_API_VERSION.split(".")[0];
