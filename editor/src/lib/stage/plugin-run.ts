import { installPlugin, PluginError, pluginTypes, type PluginModule } from "@engine/scene/plugins";
import { importPluginCode } from "#lib/plugins/compile.js";
import type { RunResult } from "./frame-protocol";

/**
 * The stage frame's half of the Code tab's **Run** (#234): the page transpiled the TypeScript (`transpilePlugin`); here,
 * in the sandboxed frame and nowhere else, the module is imported from a blob URL and installed in the frame's
 * registry under the plugin's id, replacing its previous registrations. The answer is data: the types it registered,
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
  } catch (e) {
    return { ok: false, error: e instanceof PluginError ? e.message : `register failed – ${messageOf(e)}` };
  }
  return { ok: true, types: pluginTypes(id) };
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
