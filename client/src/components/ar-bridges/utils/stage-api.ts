import type { EntityData, IGame } from "@/types";
import { TUNE_ENTITY_EVENT, TuneEntityDetail } from "@/types";
import { getConfigVersion, getSpreads, getTargets } from "@/utils/game-config";
import { getPreview, PreviewBackdrop, PreviewOrbit, PreviewState, PreviewView, setTargetHidden, subscribePreview, updatePreview } from "./preview";

/**
 * The stage protocol (three-free, main chunk): how an editor drives the reader's stage – the AR scene over the mock
 * stage on the `/stage` route – and hears from it. Two transports, one vocabulary: same origin reads `window.osctStage`
 * directly; another origin (an editor served elsewhere) sends `postMessage` commands and receives events. The stage
 * answers only origins it allows: its own, and the ones in `VITE_EDITOR_ORIGINS` (comma-separated). The first message
 * from an editor is the handshake: from then on state goes to that origin.
 */

export const STAGE_PROTOCOL = 1;

/** Message type of a command to the stage, and of an event from it */
export const STAGE_COMMAND_TYPE = "osct:stage-command";
export const STAGE_EVENT_TYPE = "osct:stage";

export type StageCommand =
  | { type: "ping" }
  | { type: "setSpread"; spreadId: string }
  | { type: "setPreview"; patch: Partial<Pick<PreviewState, "view" | "orbit" | "backdrop" | "wobble" | "photo">> }
  | { type: "setHidden"; targetId: string; hidden: boolean }
  | { type: "replayUnlock"; targetIds?: string[] }
  | { type: "tune"; targetId: string; entity: EntityData | null };

export interface StageTargetState {
  id: string;
  entryId: string;
  entityType: string | null;
  /** Reported found by the tracker right now */
  found: boolean;
  /** Switched off in the preview (reported lost) */
  hidden: boolean;
}

export interface StageState {
  protocol: number;
  spreadId: string | null;
  spreads: Array<{ id: string; title: string; firstPage: number; lastPage: number }>;
  targets: StageTargetState[];
  preview: { view: PreviewView; orbit: PreviewOrbit | null; backdrop: PreviewBackdrop; wobble: number; hasPhoto: boolean };
  content: { hash: string | null; version: string; schema: string };
}

export type StageEvent =
  | { type: typeof STAGE_EVENT_TYPE; event: "ready"; state: StageState }
  | { type: typeof STAGE_EVENT_TYPE; event: "state"; state: StageState }
  | { type: typeof STAGE_EVENT_TYPE; event: "tapped"; targetId: string }
  | { type: typeof STAGE_EVENT_TYPE; event: "error"; message: string };

export interface StageApi {
  readonly protocol: number;
  send(command: StageCommand): void;
  getState(): StageState;
  subscribe(listener: (event: StageEvent) => void): () => void;
}

declare global {
  interface Window {
    osctStage?: StageApi;
  }
}

/** Hide → show again: the outro (0.7 s) ends before the target is found again */
const REPLAY_GAP_MS = 900;

let embedded = false;
let replayTimer = 0;
/** Where a tap goes while the stage API is installed */
let tapSink: ((event: StageEvent) => void) | null = null;

/** The stage route is open: taps are reported to the editor instead of opening the entry */
export const isStageEmbedded = (): boolean => embedded;

/** Every shown target is locked again, hidden, and found anew: the unlock animation plays (the editor's replay) */
export const replayUnlock = (game: Readonly<IGame>, targetIds?: readonly string[]): void => {
  const spread = game.state.currentSpread;
  const hidden = new Set(getPreview().hidden);
  const ids = (targetIds ?? (spread ? getTargets(spread).filter(t => t.imageSrc).map(t => t.id) : [])).filter(id => !hidden.has(id));
  ids.forEach(id => {
    game.history.forgetTarget(id);
    setTargetHidden(id, true);
  });
  window.clearTimeout(replayTimer);
  replayTimer = window.setTimeout(() => ids.forEach(id => setTargetHidden(id, false)), REPLAY_GAP_MS);
};

const allowedOrigins = (): Set<string> => {
  const configured = (import.meta.env.VITE_EDITOR_ORIGINS as string | undefined)?.split(",").map(origin => origin.trim()).filter(Boolean) ?? [];
  return new Set([location.origin, ...configured]);
};

const stateOf = (game: Readonly<IGame>): StageState => {
  const preview = getPreview();
  const spreadId = game.state.currentSpread;
  const tracked = new Set(game.state.trackedTargets);
  const hidden = new Set(preview.hidden);
  const version = getConfigVersion();
  return {
    protocol: STAGE_PROTOCOL,
    spreadId,
    spreads: getSpreads().map(spread => ({ id: spread.id, title: spread.title, firstPage: spread.firstPage, lastPage: spread.lastPage })),
    targets: (spreadId ? getTargets(spreadId) : []).filter(target => target.imageSrc).map(target => ({
      id: target.id,
      entryId: target.entryId,
      entityType: target.entity?.type ?? null,
      found: tracked.has(target.id),
      hidden: hidden.has(target.id),
    })),
    preview: { view: preview.view, orbit: preview.orbit, backdrop: preview.backdrop, wobble: preview.wobble, hasPhoto: !!preview.photo },
    content: { hash: version.hash ?? null, version: version.version, schema: version.schema },
  };
};

/**
 * Serve the stage while the stage route is open: `window.osctStage` for the same origin, `postMessage` for an editor
 * in another window. Returns the cleanup.
 */
export const installStageApi = (game: Readonly<IGame>): (() => void) => {
  embedded = true;
  const listeners = new Set<(event: StageEvent) => void>();
  const allowed = allowedOrigins();
  /** The editor window that spoke to us (the handshake), and where to answer */
  let editor: { window: Window; origin: string } | null = null;

  const emit = (event: StageEvent): void => {
    listeners.forEach(listener => listener(event));
    if (editor) editor.window.postMessage(event, editor.origin);
  };
  const emitState = (): void => emit({ type: STAGE_EVENT_TYPE, event: "state", state: stateOf(game) });

  const run = (command: StageCommand): void => {
    switch (command.type) {
      case "ping":
        return emitState();
      case "setSpread":
        if (!getSpreads().some(spread => spread.id === command.spreadId)) return emit({ type: STAGE_EVENT_TYPE, event: "error", message: `Unknown spread ${command.spreadId}` });
        return game.spreads.switchSpread(command.spreadId);
      case "setPreview":
        return updatePreview(command.patch);
      case "setHidden":
        return setTargetHidden(command.targetId, command.hidden);
      case "replayUnlock":
        return replayUnlock(game, command.targetIds);
      case "tune":
        document.dispatchEvent(new CustomEvent<TuneEntityDetail>(TUNE_ENTITY_EVENT, { detail: { targetId: command.targetId, entity: command.entity } }));
        return;
      default:
        return emit({ type: STAGE_EVENT_TYPE, event: "error", message: `Unknown command ${(command as { type?: string }).type ?? "?"}` });
    }
  };

  const onMessage = (event: MessageEvent): void => {
    const data = event.data as { type?: string; command?: StageCommand } | null;
    if (!data || data.type !== STAGE_COMMAND_TYPE || !data.command) return;
    if (!allowed.has(event.origin)) {
      console.warn(`[stage] Command from ${event.origin} ignored – not an allowed editor origin`);
      return;
    }
    if (event.source && "postMessage" in event.source) editor = { window: event.source as Window, origin: event.origin };
    run(data.command);
  };

  const api: StageApi = {
    protocol: STAGE_PROTOCOL,
    send: run,
    getState: () => stateOf(game),
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  window.osctStage = api;
  tapSink = emit;
  window.addEventListener("message", onMessage);
  const cleanups = [
    game.subscribeToProperty("currentSpread", emitState),
    game.subscribeToProperty("trackedTargets", emitState),
    subscribePreview(emitState),
  ];
  // Hello to whoever embeds us (any origin may learn that a stage is here; state follows only after its first command)
  if (window.parent !== window) window.parent.postMessage({ type: STAGE_EVENT_TYPE, event: "ready", state: stateOf(game) } satisfies StageEvent, "*");

  return () => {
    embedded = false;
    tapSink = null;
    window.removeEventListener("message", onMessage);
    cleanups.forEach(cleanup => cleanup());
    listeners.clear();
    window.clearTimeout(replayTimer);
    if (window.osctStage === api) delete window.osctStage;
  };
};

/** A tap on an entity while the stage is embedded: the editor hears it (nothing opens in the reader) */
export const reportStageTap = (targetId: string): void => {
  tapSink?.({ type: STAGE_EVENT_TYPE, event: "tapped", targetId });
};
