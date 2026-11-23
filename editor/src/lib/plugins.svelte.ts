import { SvelteMap } from "svelte/reactivity";
import { nodeTypeFailure, pluginNodeTypesOf } from "@engine/scene/plugins";
import { getPlugins } from "@engine/content/game-config";
import type { EntityData } from "@engine/types";
import { deletePlugin, errorText, getPlugin, listPlugins, putPlugin, replacePluginFile, uploadPlugin, type PluginSource, type PluginSummary } from "./api";
import { library } from "./library.svelte";
import { transpilePlugin, type CompileError } from "#lib/plugins/compile.js";
import type { Stage } from "#lib/stage/stage.svelte.js";
import { NO_ANSWER, type StageLog } from "#lib/stage/stage-types.js";
import { trackUnsaved } from "#lib/unsaved.js";
import { unsavedPlugin } from "#lib/library-code.js";
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
 * A stored source on the stage (#269): loading, running as saved, running the Code tab's unsaved edits (a Run), failed
 * (the error – what ran before stays registered), or skipped at the auto-load because it hung the stage the last time
 */
export type SourceStatus =
  | { state: "loading" }
  | { state: "saved" }
  | { state: "edits" }
  | { state: "failed"; error: string }
  | { state: "skipped"; error: string };

/** How long the auto-load waits for one source before it counts as hanging the stage */
export const AUTO_LOAD_TIMEOUT_MS = 10_000;

/** The source whose auto-load has not answered yet, per experience: a page that froze on it skips it at the next open */
const hungKey = (experienceId: string) => `osct-code-autoload:${experienceId}`;
const readHung = (experienceId: string): string | null => {
  try {
    return window.localStorage.getItem(hungKey(experienceId));
  } catch {
    return null;
  }
};
const writeHung = (experienceId: string, id: string | null): void => {
  try {
    if (id) window.localStorage.setItem(hungKey(experienceId), id);
    else window.localStorage.removeItem(hungKey(experienceId));
  } catch {
    // no storage: the way out of a hang is only the timeout
  }
};

/** What a Run needs of the stage: its runner, a refresh and the overrides (a node made code switches through them) */
export type RunStage = Pick<Stage, "runPlugin" | "refresh" | "treeOf" | "overrideOf" | "override">;

/**
 * The Code tab's open source: the plugin open (or a new one being added), its text and the text as stored. It lives
 * here, not in the tab, so a tab switch loses no edit and the Library marks the script with unsaved edits (#232).
 */
export class CodeBuffer {
  open = $state<string | null>(null);
  adding = $state(false);
  /** The new plugin's id while it is being added */
  newId = $state("");
  source = $state("");
  /** The source as stored – "" for a plugin only the content declares, so Save stores a copy of it */
  saved = $state("");
  /** The source as loaded or last saved: the edits are unsaved while the text differs */
  loaded = $state("");

  get unsaved(): boolean {
    return this.source !== this.loaded;
  }

  /** The plugin with unsaved edits, null for none (a new plugin has no id yet) */
  get unsavedId(): string | null {
    return unsavedPlugin(this);
  }

  reset(): void {
    this.open = null;
    this.adding = false;
    this.newId = "";
    this.source = "";
    this.saved = "";
    this.loaded = "";
  }
}

/** How many lines of the experience's code the Code tab keeps */
export const LOG_LINES = 50;
/** How many of the plugins' lines the Log tab keeps */
export const JOURNAL_LINES = 100;

/**
 * The Code tab's plugins (docs/plugins.md "Trying it: the Code tab"): the sources stored for the experience (the
 * API's `plugins`), the plugins the content declares (compiled by the content build, loaded by the engine with the
 * scene), and **Run** – transpile in the browser, then import and install in the stage's registry under the plugin's
 * id – in the editor's page, with its session (#340) –, build the scene again. `version` counts the runs and the
 * registry's changes the stage reports: the Inspector's rows follow the registry through it. A stored source someone else
 * saved last runs by itself only after the guard's prompt (`plugin-guard.svelte.ts`); the ones kept off are `declined`.
 * `logs` are the plugins' lines from the stage (`api.log`, their errors), newest last, for the Code tab; `journal` the
 * same lines for the Log tab.
 * The Library lists the same sources as its scripts (#186): it uploads a script file as a new source, replaces one
 * from a file, and asks the Code tab to open one (`focus`).
 * A Run also reports a node type of the plugin that did not build on the stage (its error, as a Run's), and switches a
 * node made code (`pending`) once its type builds – until then the node keeps its old type on the stage.
 */
class Plugins {
  experienceId = $state<string | null>(null);
  /** The sources stored for the experience */
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
  /** The Code tab's open source, kept while the tab is closed */
  readonly code = new CodeBuffer();
  /** The plugins' lines from the stage, newest last (at most `LOG_LINES`) */
  logs = $state<StageLog[]>([]);
  /**
   * The plugins the guard keeps off the stage (#340: the person answered *Don't run* to code someone else saved last), by
   * id, with why – the auto-load skips them and the Code tab says so; a Run in the Code tab still runs one
   */
  readonly declined = new SvelteMap<string, string>();
  /** The sources run here, by plugin id: what is installed, saved or not */
  private ran = new Map<string, string>();
  /** Each stored source on the stage (#269): loaded by itself, run, failed – the Code tab and the pickers say it */
  readonly status = new SvelteMap<string, SourceStatus>();
  /** The saved sources are being loaded onto a new stage */
  autoLoading = $state(false);
  /** The stored text of each source as last read or saved: a run of the same text runs the saved version */
  private storedText = new Map<string, string>();

  /**
   * The same lines for the Log tab's timeline, newest last (at most `JOURNAL_LINES`): not emptied by a Run, only by the
   * Log tab's *clear*
   */
  journal = $state<StageLog[]>([]);

  /** A line from the stage (a plugin's log, its error) */
  addLog(line: StageLog): void {
    this.logs = [...this.logs.slice(-(LOG_LINES - 1)), line];
    this.journal = [...this.journal.slice(-(JOURNAL_LINES - 1)), line];
  }

  /** The Log tab's *clear* (the Code tab's log stays) */
  clearJournal(): void {
    this.journal = [];
  }

  async load(experienceId: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.stored = (await listPlugins(experienceId)).plugins;
      if (this.experienceId !== experienceId) {
        this.ran.clear();
        this.status.clear();
        this.storedText.clear();
        this.pending = null;
        this.declined.clear();
        this.code.reset();
        this.journal = [];
      }
      this.experienceId = experienceId;
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.loading = false;
    }
  }

  /** The plugins the content declares (compiled by the content build), by id */
  declared(): Array<{ id: string; src: string }> {
    return getPlugins().map(plugin => ({ id: plugin.id, src: plugin.src }));
  }

  /** The saved texts being read or read, by experience, plugin and saved version (`savedSource`) */
  private reading = new Map<string, Promise<string>>();

  /**
   * A stored source's saved text, read once per saved version (#340): the auto-load, the Logic view and the Log tab ask
   * for the same sources – one request each, again only after a new save
   */
  savedSource(experienceId: string, id: string): Promise<string> {
    const row = this.stored.find(p => p.id === id);
    const key = `${experienceId}|${id}|${row?.updatedAt ?? ""}|${row?.size ?? ""}`;
    let reading = this.reading.get(key);
    if (!reading) {
      reading = this.source(experienceId, id);
      reading.catch(() => this.reading.delete(key));
      this.reading.set(key, reading);
    }
    return reading;
  }

  async source(experienceId: string, id: string): Promise<string> {
    const text = (await getPlugin(experienceId, id)).plugin.source;
    this.storedText.set(id, text);
    return text;
  }

  /** Whether a source's text is the saved one (a run of it runs the saved version) */
  private stateOf(id: string, source: string): SourceStatus {
    return this.storedText.get(id) === source ? { state: "saved" } : { state: "edits" };
  }

  /**
   * Why a type the draft names (a look, a component) is not registered (#269), for a picker: the experience's code is still
   * loading, a source failed (it may be the one registering it), or nothing registers it
   */
  missingNote(): string {
    if (this.autoLoading || [...this.status.values()].some(s => s.state === "loading")) return "loading the experience's code…";
    const failed = this.failed();
    if (failed.length) return `not loaded – ${failed.map(f => f.id).join(", ")} failed`;
    return "unknown – no plugin registers it";
  }

  /** The stored sources that are not on the stage: failed or skipped, with why */
  failed(): Array<{ id: string; error: string }> {
    return [...this.status].flatMap(([id, s]) => (s.state === "failed" || s.state === "skipped" ? [{ id, error: s.error }] : []));
  }

  /**
   * The Code tab's code is part of the live stage (#269): a stage that starts (the workspace opens) gets every stored
   * source the guard did not keep off (`declined`, #340) – before its first scene builds (`refresh: false`: nothing to
   * build again yet) – the text last run here if there is one, else the saved one – transpiled, imported and
   * installed as a Run would, one after the other, then the scene built once. A source that fails keeps what ran
   * before and says why (`status`); one that does not answer in `AUTO_LOAD_TIMEOUT_MS` counts as hanging the stage,
   * and a page that froze on it (the mark stays in the browser) skips it the next time it opens. The Code tab's log
   * and the Run's error stay the Run's.
   */
  async autoLoad(experienceId: string, stage: RunStage, { refresh = true }: { refresh?: boolean } = {}): Promise<void> {
    if (this.autoLoading) return;
    this.autoLoading = true;
    try {
      if (this.experienceId !== experienceId) await this.load(experienceId);
      if (this.experienceId !== experienceId) return;
      const hung = readHung(experienceId);
      let loaded = 0;
      /** The source the stage stopped answering at: the rest wait (the stage is likely still in it) */
      let stuck: string | null = null;
      for (const { id } of this.stored) {
        if (stuck) {
          this.status.set(id, { state: "failed", error: `not loaded – the stage stopped answering at ${stuck}` });
          continue;
        }
        const declined = this.declined.get(id);
        if (declined) {
          this.status.set(id, { state: "skipped", error: declined });
          continue;
        }
        if (id === hung) {
          writeHung(experienceId, null);
          this.status.set(id, { state: "skipped", error: "it hung the stage when it loaded last time – fix it, then Run it" });
          continue;
        }
        this.status.set(id, { state: "loading" });
        try {
          const source = this.ran.get(id) ?? (await this.savedSource(experienceId, id));
          const result = await transpilePlugin(source, id);
          if ("error" in result) {
            this.status.set(id, { state: "failed", error: `${result.error.line !== null ? `line ${result.error.line}: ` : ""}${result.error.message}` });
            continue;
          }
          writeHung(experienceId, id);
          const ran = await stage.runPlugin(id, result.code, AUTO_LOAD_TIMEOUT_MS);
          // A stage that did not answer may still be stuck in it: the mark stays, the next open skips it
          if (!ran.ok && ran.error.startsWith(NO_ANSWER)) stuck = id;
          else writeHung(experienceId, null);
          if (!ran.ok) {
            this.status.set(id, { state: "failed", error: ran.error });
            continue;
          }
          this.ran.set(id, source);
          this.status.set(id, this.stateOf(id, source));
          loaded += 1;
        } catch (e) {
          this.status.set(id, { state: "failed", error: errorText(e) });
        }
      }
      if (!loaded) return;
      this.version += 1;
      // Before the first scene (the stage starting, #340): it builds with them – nothing to build again
      if (!refresh) return;
      await stage.refresh();
      // A node type that does not build is the source's failure (its registrations stay)
      for (const { id } of this.stored) {
        const type = pluginNodeTypesOf(id).find(t => nodeTypeFailure(t));
        if (type) this.status.set(id, { state: "failed", error: `${type} did not build on the stage – ${nodeTypeFailure(type)}` });
      }
    } catch (e) {
      console.warn(`[code] the saved sources did not load: ${errorText(e)}`);
    } finally {
      this.autoLoading = false;
    }
  }

  /** The source of a declared plugin: the content build copies `index.ts` next to the compiled module */
  async declaredSource(src: string): Promise<string> {
    const url = src.replace(/plugin\.js(\?.*)?$/, "index.ts");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${url})`);
    return response.text();
  }

  /** The source of a plugin as it runs on the stage: the source last run here, else the stored one, else the declared one's */
  async sourceOf(experienceId: string, id: string): Promise<string> {
    const ran = this.ran.get(id);
    if (ran !== undefined) return ran;
    if (this.experienceId !== experienceId) await this.load(experienceId);
    if (this.stored.some(p => p.id === id)) return this.source(experienceId, id);
    const declared = this.declared().find(p => p.id === id);
    if (declared) return this.declaredSource(declared.src);
    throw new Error(`the plugin ${id} has no source in this experience`);
  }

  async save(experienceId: string, id: string, source: string): Promise<PluginSummary> {
    this.error = null;
    try {
      const { plugin } = await putPlugin(experienceId, id, source);
      this.storedText.set(id, source);
      return this.keep(plugin);
    } catch (e) {
      this.error = errorText(e, { code: true });
      throw e;
    }
  }

  /** A script file as a new source, its id from the file's name (409 plugin-exists when that id is taken) */
  async upload(experienceId: string, file: File): Promise<PluginSummary> {
    return this.keep(await uploadPlugin(experienceId, file));
  }

  /** A script file replaces the source of `id` */
  async replaceFile(experienceId: string, id: string, file: File): Promise<PluginSummary> {
    return this.keep(await replacePluginFile(experienceId, id, file));
  }

  /** Remove a source; refused while the draft uses what it registers (409 plugin-in-use with the usages) unless forced */
  async remove(experienceId: string, id: string, force = false): Promise<void> {
    this.error = null;
    await deletePlugin(experienceId, id, force);
    this.stored = this.stored.filter(p => p.id !== id);
    this.status.delete(id);
    this.storedText.delete(id);
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
   * Run a plugin's source on the stage: transpile, then import and install it in the stage's registry (replacing the
   * plugin's previous registrations), build the scene again so its effect shows. Returns true when it ran; the error
   * is in `runError` otherwise. The log starts anew with every Run.
   */
  async run(id: string, source: string, stage: RunStage | null): Promise<boolean> {
    this.running = true;
    this.runError = null;
    this.logs = [];
    try {
      const result = await transpilePlugin(source, id);
      if ("error" in result) {
        this.runError = { ...result.error, plugin: id };
        this.runFailed(id, `${result.error.line !== null ? `line ${result.error.line}: ` : ""}${result.error.message}`);
        return false;
      }
      if (!stage) {
        this.runError = { plugin: id, message: "The stage is not running – open a scene to run the code", line: null };
        return false;
      }
      const ran = await stage.runPlugin(id, result.code);
      if (!ran.ok) {
        this.runError = { plugin: id, message: ran.error, line: null };
        this.runFailed(id, ran.error);
        return false;
      }
      this.ran.set(id, source);
      if (this.stored.some(p => p.id === id)) this.status.set(id, this.stateOf(id, source));
      this.lastRun = { plugin: id, types: ran.types };
      this.version += 1;
      // The scene is built again from the new registrations: a node whose type failed before builds anew
      await stage.refresh();
      return (await this.switchPending(id, stage)) && this.builtOnStage(id);
    } catch (e) {
      this.runError = { plugin: id, message: errorText(e), line: null };
      return false;
    } finally {
      this.running = false;
    }
  }

  /** A Run of a stored source failed: it says so – what ran before stays registered */
  private runFailed(id: string, error: string): void {
    if (this.stored.some(p => p.id === id)) this.status.set(id, { state: "failed", error });
  }

  /**
   * The pending node made code of this plugin takes its new type on the stage – unless the type's build fails: then the
   * node shows as it was, the switch waits for the next Run and the failure is the Run's error. False when it failed.
   */
  private async switchPending(id: string, stage: RunStage): Promise<boolean> {
    const pending = this.pending;
    if (!pending || pending.plugin !== id) return true;
    const tree = stage.treeOf(pending.targetId);
    if (!tree || nodeAt(tree, pending.path)?.type !== pending.from) {
      this.pending = null;
      return true;
    }
    const before = stage.overrideOf(pending.targetId) ?? null;
    // The stage builds the node (the build's failure lands in the registry) before this resolves
    await stage.override(pending.targetId, withNode(tree, pending.path, pending.node));
    const failure = nodeTypeFailure(pending.type);
    if (!failure) {
      this.pending = null;
      return true;
    }
    await stage.override(pending.targetId, before);
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

// A reload (the new-version bar) would drop the Code tab's edits, whether the tab is open or not
trackUnsaved(() => plugins.code.unsaved);
