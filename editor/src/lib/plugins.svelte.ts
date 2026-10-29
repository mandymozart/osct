import { installPlugin, PluginError, type PluginModule } from "@engine/scene/plugins";
import { getPlugins } from "@engine/content/game-config";
import { ApiError, deletePlugin, getPlugin, listPlugins, putPlugin, type PluginSummary } from "./api";
import { importPluginCode, transpilePlugin, type CompileError } from "./plugins/compile";
import type { Stage } from "./stage/stage.svelte";

/**
 * The Code tab's plugins (agents/research/2026-10-29-code-in-the-editor.md): the sources stored for the book (the
 * API's `plugins`), the plugins the content declares (compiled by the content build, loaded by the engine with the
 * spread), and **Run** – transpile in the browser, import, install in the stage's registry under the plugin's id,
 * build the spread again. `version` counts the runs: the Entity panel's rows follow the registry through it.
 */
class Plugins {
  bookId = $state<string | null>(null);
  /** The sources stored for the book */
  stored = $state<PluginSummary[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  /** Runs so far – a dependency for whoever reads the component registry */
  version = $state(0);
  running = $state(false);
  /** The last Run's error (a transpile error names its line), null after a good run */
  runError = $state<(CompileError & { plugin: string }) | null>(null);
  /** The last good Run: the plugin and the component types it registered */
  lastRun = $state<{ plugin: string; types: string[] } | null>(null);

  async load(bookId: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.stored = (await listPlugins(bookId)).plugins;
      this.bookId = bookId;
    } catch (e) {
      this.error = e instanceof ApiError ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  /** The plugins the content declares (compiled by the content build), by id */
  declared(): Array<{ id: string; src: string }> {
    return getPlugins().map(plugin => ({ id: plugin.id, src: plugin.src }));
  }

  async source(bookId: string, id: string): Promise<string> {
    return (await getPlugin(bookId, id)).plugin.source;
  }

  /** The source of a declared plugin: the content build copies `index.ts` next to the compiled module */
  async declaredSource(src: string): Promise<string> {
    const url = src.replace(/plugin\.js(\?.*)?$/, "index.ts");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${url})`);
    return response.text();
  }

  async save(bookId: string, id: string, source: string): Promise<PluginSummary> {
    this.error = null;
    try {
      const { plugin } = await putPlugin(bookId, id, source);
      const summary: PluginSummary = { id: plugin.id, size: plugin.size, updatedAt: plugin.updatedAt, updatedBy: plugin.updatedBy };
      this.stored = [...this.stored.filter(p => p.id !== id), summary].sort((a, b) => a.id.localeCompare(b.id));
      return summary;
    } catch (e) {
      this.error = e instanceof ApiError ? `${e.message} (${e.code})` : String(e);
      throw e;
    }
  }

  async remove(bookId: string, id: string): Promise<void> {
    this.error = null;
    await deletePlugin(bookId, id);
    this.stored = this.stored.filter(p => p.id !== id);
  }

  /**
   * Run a plugin's source on the stage: transpile, import, install (replacing the plugin's previous registrations),
   * build the spread again so its effect shows. Returns true when it ran; the error is in `runError` otherwise.
   */
  async run(id: string, source: string, stage: Stage | null, importer?: (url: string) => Promise<unknown>): Promise<boolean> {
    this.running = true;
    this.runError = null;
    try {
      const result = await transpilePlugin(source, id);
      if ("error" in result) {
        this.runError = { ...result.error, plugin: id };
        return false;
      }
      let module: PluginModule;
      try {
        module = (await importPluginCode(result.code, importer)) as PluginModule;
      } catch (e) {
        this.runError = { plugin: id, message: `The module did not load – ${e instanceof Error ? e.message : String(e)}`, line: null };
        return false;
      }
      try {
        installPlugin(id, module);
      } catch (e) {
        this.runError = { plugin: id, message: e instanceof PluginError ? e.message : `register failed – ${e instanceof Error ? e.message : String(e)}`, line: null };
        return false;
      }
      const { pluginTypes } = await import("@engine/scene/plugins");
      this.lastRun = { plugin: id, types: pluginTypes(id) };
      this.version += 1;
      await stage?.refresh();
      return true;
    } finally {
      this.running = false;
    }
  }
}

export const plugins = new Plugins();
