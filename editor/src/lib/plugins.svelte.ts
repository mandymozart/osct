import { installPlugin, nodeTypeFailure, PluginError, pluginNodeTypesOf, type PluginModule } from "@engine/scene/plugins";
import { getPlugins } from "@engine/content/game-config";
import type { EntityData } from "@engine/types";
import { ApiError, deletePlugin, getPlugin, listPlugins, putPlugin, replacePluginFile, uploadPlugin, type PluginSource, type PluginSummary } from "./api";
import { library } from "./library.svelte";
import { importPluginCode, transpilePlugin, type CompileError } from "#lib/plugins/compile.js";
import type { Stage } from "#lib/stage/stage.svelte.js";
import { nodeAt, withNode } from "./values";

/** A node made code whose new type has not built yet: it shows as it was until its plugin's code builds it (#199) */
export interface PendingSwitch {
  /** The made plugin */
  plugin: string;
  /** The node type it registers */
  type: string;
  targetId: string;
  /** The node in the target's tree */
  path: number[];
  /** The node's type before – a tree whose node at `path` is no longer of it drops the switch */
  from: string;
  /** The node switched to the new type */
  node: EntityData;
}

/**
 * The Code tab's plugins (docs/plugins.md "Trying it: the Code tab"): the sources stored for the book (the
 * API's `plugins`), the plugins the content declares (compiled by the content build, loaded by the engine with the
 * spread), and **Run** – transpile in the browser, import, install in the stage's registry under the plugin's id,
 * build the spread again. `version` counts the runs: the Entity panel's rows follow the registry through it.
 * The Library lists the same sources as its scripts (#186): it uploads a script file as a new source, replaces one
 * from a file, and asks the Code tab to open one (`focus`).
 * A Run also reports a node type of the plugin that did not build on the stage (its error, as a Run's), and switches a
 * node made code (`pending`) once its type builds – until then the node keeps its old type on the stage.
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
  /** A plugin the Code tab should open (the Library's *Open in Code*, a node made code that did not build); the tab clears it once open */
  focus = $state<string | null>(null);
  /** A node made code that switches to its type once that builds (#199) */
  pending = $state<PendingSwitch | null>(null);
  /** The sources run here, by plugin id: what is installed, saved or not */
  private ran = new Map<string, string>();

  async load(bookId: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.stored = (await listPlugins(bookId)).plugins;
      if (this.bookId !== bookId) {
        this.ran.clear();
        this.pending = null;
      }
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

  /** The source of a plugin as it runs on the stage: the source last run here, else the stored one, else the declared one's */
  async sourceOf(bookId: string, id: string): Promise<string> {
    const ran = this.ran.get(id);
    if (ran !== undefined) return ran;
    if (this.bookId !== bookId) await this.load(bookId);
    if (this.stored.some(p => p.id === id)) return this.source(bookId, id);
    const declared = this.declared().find(p => p.id === id);
    if (declared) return this.declaredSource(declared.src);
    throw new Error(`the plugin ${id} has no source in this book`);
  }

  async save(bookId: string, id: string, source: string): Promise<PluginSummary> {
    this.error = null;
    try {
      const { plugin } = await putPlugin(bookId, id, source);
      return this.keep(plugin);
    } catch (e) {
      this.error = e instanceof ApiError ? `${e.message} (${e.code})` : String(e);
      throw e;
    }
  }

  /** A script file as a new source, its id from the file's name (409 plugin-exists when that id is taken) */
  async upload(bookId: string, file: File): Promise<PluginSummary> {
    return this.keep(await uploadPlugin(bookId, file));
  }

  /** A script file replaces the source of `id` */
  async replaceFile(bookId: string, id: string, file: File): Promise<PluginSummary> {
    return this.keep(await replacePluginFile(bookId, id, file));
  }

  /** Remove a source; refused while the draft uses what it registers (409 plugin-in-use with the usages) unless forced */
  async remove(bookId: string, id: string, force = false): Promise<void> {
    this.error = null;
    await deletePlugin(bookId, id, force);
    this.stored = this.stored.filter(p => p.id !== id);
    void library.refresh();
  }

  /** A saved source into the list (its uses as counted before – a source's text does not change the draft's rows); the
   * Library's shaders count the sources that load them, so their uses are read again */
  private keep(plugin: PluginSource): PluginSummary {
    const usages = this.stored.find(p => p.id === plugin.id)?.usages ?? 0;
    const summary: PluginSummary = { id: plugin.id, size: plugin.size, usages, updatedAt: plugin.updatedAt, updatedBy: plugin.updatedBy };
    this.stored = [...this.stored.filter(p => p.id !== plugin.id), summary].sort((a, b) => a.id.localeCompare(b.id));
    void library.refresh();
    return summary;
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
      this.ran.set(id, source);
      this.lastRun = { plugin: id, types: pluginTypes(id) };
      this.version += 1;
      // The spread is built again from the new registrations: a node whose type failed before builds anew
      await stage?.refresh();
      return this.switchPending(id, stage) && this.builtOnStage(id);
    } finally {
      this.running = false;
    }
  }

  /**
   * The pending node made code of this plugin takes its new type on the stage – unless the type's build fails: then the
   * node shows as it was, the switch waits for the next Run and the failure is the Run's error. False when it failed.
   */
  private switchPending(id: string, stage: Stage | null): boolean {
    const pending = this.pending;
    if (!pending || pending.plugin !== id || !stage) return true;
    const tree = stage.treeOf(pending.targetId);
    if (!tree || nodeAt(tree, pending.path)?.type !== pending.from) {
      this.pending = null;
      return true;
    }
    const before = stage.overrideOf(pending.targetId) ?? null;
    stage.override(pending.targetId, withNode(tree, pending.path, pending.node));
    const failure = nodeTypeFailure(pending.type);
    if (!failure) {
      this.pending = null;
      return true;
    }
    stage.override(pending.targetId, before);
    this.runError = { plugin: id, message: `${pending.type} did not build – ${failure}. The node stays a ${pending.from} until it builds: fix the code, Run.`, line: null };
    return false;
  }

  /** The plugin's node types built on the stage; a failed one is the Run's error. False when one failed */
  private builtOnStage(id: string): boolean {
    for (const type of pluginNodeTypesOf(id)) {
      const failure = nodeTypeFailure(type);
      if (failure) {
        this.runError = { plugin: id, message: `${type} did not build on the stage – ${failure}`, line: null };
        return false;
      }
    }
    return true;
  }
}

export const plugins = new Plugins();
