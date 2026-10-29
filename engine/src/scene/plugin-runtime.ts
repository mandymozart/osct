import { Spread } from "../types/index";
import { getSpread } from "../content/game-config";

/**
 * The plugin runtime behind `api.events`, `api.vars`, `api.progress` and `api.spread` (plugin API 1.1,
 * agents/research/2026-10-30-demo-book.md): what lets a book's code reach across nodes and pages.
 *
 * - **Events** have two owners (the concept's rule): *core events* describe the book and are emitted by the scene
 *   only (`CORE_EVENTS` – a plugin that emits one gets an error); *scene events* are the content's own, any other
 *   name, emitted and heard by plugins freely. One flat bus: every plugin on the stage hears every event.
 * - **Variables** live in a scope: `spread` while the spread is the current one, `stage` while the scene exists,
 *   `session` per app start, `book` persisted with the reader's progress (through the app's `ProgressReader`;
 *   in memory without one). A read without a scope looks outward – spread, stage, session, book – and the innermost
 *   definition wins. Every write emits the core event `varChanged`.
 * - **Progress** is read-only for plugins and comes from the app (`ArSceneOptions.progress`): unlocked targets,
 *   consulted entries, completion – never the app's store itself.
 * - **The spread** is the engine's own content model of the current spread.
 *
 * Listeners are kept per plugin id so that uninstalling a plugin (the editor's Run) removes them.
 */

/** A variable's value: a JSON scalar; `null` on a write deletes the variable */
export type VarValue = string | number | boolean;

export const VAR_SCOPES = ["spread", "stage", "session", "book"] as const;
export type VarScope = (typeof VAR_SCOPES)[number];

export const SCENE_STATES = ["running", "paused", "stopped"] as const;
export type SceneStateName = (typeof SCENE_STATES)[number];

/** The core events: the scene emits them, plugins subscribe */
export interface CoreEvents {
  targetFound: { targetId: string };
  targetLost: { targetId: string };
  /** The first find of a target (the app's progress tells the scene through `celebrate`) */
  targetUnlocked: { targetId: string };
  targetTapped: { targetId: string };
  spreadChanged: { spreadId: string; previous: string | null };
  sceneState: { state: SceneStateName };
  varChanged: { name: string; scope: VarScope; value: VarValue | undefined; previous: VarValue | undefined };
}

export const CORE_EVENTS = Object.keys({
  targetFound: true, targetLost: true, targetUnlocked: true, targetTapped: true, spreadChanged: true, sceneState: true, varChanged: true,
} satisfies Record<keyof CoreEvents, true>) as Array<keyof CoreEvents>;

export const isCoreEvent = (name: string): name is keyof CoreEvents => (CORE_EVENTS as string[]).includes(name);

/** A scene event's name: like a component type (`doorOpened`) */
export const EVENT_NAME_PATTERN = /^[a-z][a-zA-Z0-9]{0,39}$/;

export type EventListener<P = unknown> = (payload: P) => void;

/**
 * What the app knows about the reader's progress (RULES #32: the engine never reads the app's store – the reader
 * passes an adapter over its history, the editor its simulation). Every method is optional: without one, nothing is
 * unlocked or consulted, and `book` variables live in memory.
 */
export interface ProgressReader {
  unlocked?(targetId: string): boolean;
  consulted?(entryId: string): boolean;
  /** The persisted `book` variables */
  variables?: {
    get(name: string): VarValue | undefined;
    set(name: string, value: VarValue | null): void;
    all(): Record<string, VarValue>;
  };
}

/** `api.events` */
export interface PluginEvents {
  /** Hear a core event or a scene event; returns the unsubscribe (a plugin's listeners go when it is uninstalled) */
  on<E extends keyof CoreEvents>(event: E, listener: EventListener<CoreEvents[E]>): () => void;
  on(event: string, listener: EventListener): () => void;
  /** Emit a scene event (any name that is not a core event) to every plugin on the stage */
  emit(event: string, payload?: unknown): void;
}

/** `api.vars` */
export interface PluginVars {
  /** The value in `scope`, or without one the innermost definition (spread → stage → session → book) */
  get(name: string, scope?: VarScope): VarValue | undefined;
  /** Set (or delete with `null`) a variable in a scope – `spread` by default */
  set(name: string, value: VarValue | null, scope?: VarScope): void;
  /** Hear every change of a variable (in any scope) */
  on(name: string, listener: (value: VarValue | undefined, previous: VarValue | undefined, scope: VarScope) => void): () => void;
  /** Every variable of a scope */
  all(scope: VarScope): Record<string, VarValue>;
}

/** `api.progress` – read-only */
export interface PluginProgress {
  unlocked(targetId: string): boolean;
  consulted(entryId: string): boolean;
  /** Unlocked targets of a spread (the whole book without an id) as 0–1; a spread without targets counts as complete */
  completion(spreadId?: string): number;
  counts(spreadId?: string): { unlocked: number; targets: number };
}

/** `api.spread` */
export interface PluginSpread {
  /** The current spread as the engine knows it, null before the first spread */
  readonly current: Spread | null;
  get(spreadId: string): Spread | undefined;
}

export class PluginRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginRuntimeError";
  }
}

interface Listener { plugin: string; event: string; listener: EventListener; run: number }

/** Counts the installs: the listeners of one run of a plugin are told from the previous run's */
let runs = 0;
export const nextRun = (): number => ++runs;

const listeners = new Set<Listener>();
/** The editor's log: hears every delivery without being a plugin */
const observers = new Set<(event: string, payload: unknown) => void>();
const scopes: Record<Exclude<VarScope, "book">, Map<string, VarValue>> = { spread: new Map(), stage: new Map(), session: new Map() };
/** The `book` scope without an app that persists it */
const bookInMemory = new Map<string, VarValue>();
let progress: ProgressReader = {};
let currentSpreadId: string | null = null;
let spreadsAccessor: (id: string) => Spread | undefined = getSpread;

const isVarValue = (value: unknown): value is VarValue =>
  typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

/** Deliver an event to every listener (a listener that throws is logged, the others still run) */
const deliver = (event: string, payload: unknown): void => {
  observers.forEach(observer => observer(event, payload));
  [...listeners].filter(l => l.event === event).forEach(({ listener, plugin }) => {
    try {
      listener(payload);
    } catch (error) {
      console.error(`[plugins] ${plugin}: the listener for "${event}" failed:`, error);
    }
  });
};

const bookVars = () => progress.variables;

const readVar = (name: string, scope: VarScope): VarValue | undefined =>
  scope === "book" ? (bookVars() ? bookVars()!.get(name) : bookInMemory.get(name)) : scopes[scope].get(name);

const writeVar = (name: string, value: VarValue | null, scope: VarScope): void => {
  const previous = readVar(name, scope);
  if (scope === "book") {
    if (bookVars()) bookVars()!.set(name, value);
    else if (value === null) bookInMemory.delete(name);
    else bookInMemory.set(name, value);
  } else if (value === null) {
    scopes[scope].delete(name);
  } else {
    scopes[scope].set(name, value);
  }
  const next = value === null ? undefined : value;
  if (previous !== next) deliver("varChanged", { name, scope, value: next, previous } satisfies CoreEvents["varChanged"]);
};

/** The `events`, `vars`, `progress` and `spread` parts of a plugin's API, with its listeners kept under its id */
export const runtimeApi = (plugin: string, run = nextRun()): { events: PluginEvents; vars: PluginVars; progress: PluginProgress; spread: PluginSpread } => {
  const on = (event: string, listener: EventListener): (() => void) => {
    if (typeof listener !== "function") throw new PluginRuntimeError(`${plugin}: events.on("${event}") needs a listener function`);
    if (!isCoreEvent(event) && !EVENT_NAME_PATTERN.test(event)) throw new PluginRuntimeError(`${plugin}: "${event}" is not an event name (camelCase letters and digits)`);
    const entry: Listener = { plugin, event, listener, run };
    listeners.add(entry);
    return () => listeners.delete(entry);
  };
  return {
    events: {
      on: on as PluginEvents["on"],
      emit: (event, payload) => {
        if (isCoreEvent(event)) throw new PluginRuntimeError(`${plugin}: "${event}" is a core event – the engine emits it, plugins subscribe`);
        if (!EVENT_NAME_PATTERN.test(event)) throw new PluginRuntimeError(`${plugin}: "${event}" is not an event name (camelCase letters and digits)`);
        deliver(event, payload);
      },
    },
    vars: {
      get: (name, scope) => {
        if (scope) return readVar(name, scope);
        for (const s of VAR_SCOPES) {
          const value = readVar(name, s);
          if (value !== undefined) return value;
        }
        return undefined;
      },
      set: (name, value, scope = "spread") => {
        if (!EVENT_NAME_PATTERN.test(name)) throw new PluginRuntimeError(`${plugin}: "${name}" is not a variable name (camelCase letters and digits)`);
        if (!VAR_SCOPES.includes(scope)) throw new PluginRuntimeError(`${plugin}: the scope of ${name} must be ${VAR_SCOPES.join(", ")}`);
        if (value !== null && !isVarValue(value)) throw new PluginRuntimeError(`${plugin}: ${name} takes a string, a number or a boolean (null deletes)`);
        writeVar(name, value, scope);
      },
      on: (name, listener) => on("varChanged", payload => {
        const change = payload as CoreEvents["varChanged"];
        if (change.name === name) listener(change.value, change.previous, change.scope);
      }),
      all: scope => scope === "book" ? (bookVars() ? bookVars()!.all() : Object.fromEntries(bookInMemory)) : Object.fromEntries(scopes[scope]),
    },
    progress: {
      unlocked: targetId => progress.unlocked?.(targetId) ?? false,
      consulted: entryId => progress.consulted?.(entryId) ?? false,
      counts: spreadId => progressCounts(spreadId),
      completion: spreadId => {
        const { unlocked, targets } = progressCounts(spreadId);
        return targets === 0 ? 1 : unlocked / targets;
      },
    },
    spread: {
      get current() {
        return currentSpreadId ? spreadsAccessor(currentSpreadId) ?? null : null;
      },
      get: id => spreadsAccessor(id),
    },
  };
};

const progressCounts = (spreadId?: string): { unlocked: number; targets: number } => {
  const spreads = spreadId ? [spreadsAccessor(spreadId)].filter((s): s is Spread => !!s) : allSpreads();
  const targets = spreads.flatMap(s => s.targets);
  return { unlocked: targets.filter(t => progress.unlocked?.(t.id) ?? false).length, targets: targets.length };
};

let allSpreads: () => Spread[] = () => [];

// ── The scene's side ───────────────────────────────────────────────────────────────────────────

/** The app's progress for `api.progress` and the `book` scope (the scene sets it from its options) */
export const setProgressReader = (reader: ProgressReader | undefined): void => {
  progress = reader ?? {};
};

/** Where spreads come from (the engine's content accessors; tests pass their own) */
export const setSpreadSource = (get: (id: string) => Spread | undefined, all: () => Spread[]): void => {
  spreadsAccessor = get;
  allSpreads = all;
};

/** The scene emits a core event */
export const emitCoreEvent = <E extends keyof CoreEvents>(event: E, payload: CoreEvents[E]): void => deliver(event, payload);

/** The spread changed: its scope ends, the new one is current */
export const spreadChanged = (spreadId: string): void => {
  const previous = currentSpreadId;
  currentSpreadId = spreadId;
  scopes.spread.clear();
  deliver("spreadChanged", { spreadId, previous } satisfies CoreEvents["spreadChanged"]);
};

/** The scene was torn down: the stage and spread scopes end */
export const stageEnded = (): void => {
  currentSpreadId = null;
  scopes.spread.clear();
  scopes.stage.clear();
};

/** Every listener of a plugin goes with it – or only those of other runs than `keepRun` (an install replacing the previous one), or only `onlyRun`'s (a failed install) */
export const dropPluginListeners = (plugin: string, runs: { keepRun?: number; onlyRun?: number } = {}): void => {
  [...listeners]
    .filter(l => l.plugin === plugin && (runs.keepRun === undefined || l.run !== runs.keepRun) && (runs.onlyRun === undefined || l.run === runs.onlyRun))
    .forEach(l => listeners.delete(l));
};

/** Every variable of every scope (the editor's panel, a reset) */
export const resetVars = (): void => {
  (Object.keys(scopes) as Array<keyof typeof scopes>).forEach(scope => scopes[scope].clear());
  bookInMemory.clear();
  bookVars() && Object.keys(bookVars()!.all()).forEach(name => bookVars()!.set(name, null));
};

/** A snapshot of every variable with its scope, innermost first (the editor's panel) */
export const allVars = (): Array<{ scope: VarScope; name: string; value: VarValue }> =>
  VAR_SCOPES.flatMap(scope => {
    const values = scope === "book" ? (bookVars() ? bookVars()!.all() : Object.fromEntries(bookInMemory)) : Object.fromEntries(scopes[scope]);
    return Object.entries(values).map(([name, value]) => ({ scope, name, value }));
  });

/** Hear every event of the stage without being a plugin (the editor's log); returns the unsubscribe */
export const observeEvents = (listener: (event: string, payload: unknown) => void): (() => void) => {
  observers.add(listener);
  return () => observers.delete(listener);
};
