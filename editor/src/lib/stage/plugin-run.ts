import { installPlugin, keepPlugin, PluginError, pluginTypes, type PluginModule } from "@engine/scene/plugins";
import { importPluginCode } from "#lib/plugins/compile.js";
import type { RunResult } from "./stage-types";

/**
 * The stage's half of the Code tab's **Run**: the TypeScript was transpiled (`transpilePlugin`); here the module is
 * imported from a blob URL and installed in the stage's registry under the plugin's id – in the editor's page, with its
 * session (#340; the guard asks before code someone else saved runs by itself, `plugin-guard.svelte.ts`) – replacing its previous registrations – and the content's compiled module of that id
 * is not loaded over it later (`keepPlugin`). The answer is data: the types it registered,
 * or why it did not run – the module did not load, or `register` refused or threw.
 */
export const runPluginCode = async (id: string, code: string, importer?: (url: string) => Promise<unknown>): Promise<RunResult> => {
  let module: PluginModule;
  try {
    module = (await importPluginCode(code, importer)) as PluginModule;
  } catch (e) {
    return { ok: false, error: `The module did not load – ${messageOf(e)}` };
  }
  try {
    installPlugin(id, module);
    // The content's compiled module of the same id never replaces it (#269: a saved copy of a declared plugin wins)
    keepPlugin(id);
  } catch (e) {
    return { ok: false, error: e instanceof PluginError ? e.message : `register failed – ${messageOf(e)}` };
  }
  return { ok: true, types: pluginTypes(id) };
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
