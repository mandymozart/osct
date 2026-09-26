import { ArSceneEvents, Target } from "@/types";
import { getMaxTargetsPerSpread } from "@/utils/game-config";
import { buildEntity, EntityInstance } from "./entities";

/**
 * MindAR / A-Frame helpers of the AR scene.
 * Facts from the vendored MindAR build (public/assets/deps/mindar-image-aframe.prod.js):
 * - `start()` requests the camera (getUserMedia), loads the `.mind`, emits `arReady` on the scene.
 * - `stop()` stops the camera tracks and disposes the controller – it throws before `start()`.
 * - Removing the `mindar-image` component (e.g. removing the scene) calls `stop()`.
 * - `pause()` pauses the camera video (stream kept) and tracking; `unpause()` resumes.
 */

export type MindARSystem = AFRAME.MindARImageSystem;

/** Tiny typed event emitter */
export class Emitter<Events extends { [K in keyof Events]: (...args: any[]) => void }> {
  private listeners = new Map<keyof Events, Set<(...args: any[]) => void>>();

  on<E extends keyof Events>(event: E, listener: Events[E]): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`[ArScene] listener for "${String(event)}" failed:`, error);
      }
    });
  }
}

export type ArEmitter = Emitter<ArSceneEvents>;

/** Resolves with the event, rejects on `failEvent` or after `timeout` ms */
export const waitForEvent = (
  el: EventTarget,
  event: string,
  { failEvent, timeout = 20000 }: { failEvent?: string; timeout?: number } = {},
): Promise<Event> =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      el.removeEventListener(event, onEvent);
      if (failEvent) el.removeEventListener(failEvent, onFail);
      clearTimeout(timer);
    };
    const onEvent = (e: Event) => { cleanup(); resolve(e); };
    const onFail = (e: Event) => {
      cleanup();
      reject(new Error((e as CustomEvent).detail?.error ?? failEvent));
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for ${event}`)); }, timeout);
    el.addEventListener(event, onEvent);
    if (failEvent) el.addEventListener(failEvent, onFail);
  });

/** One frame later – MindAR starts processing right after `arReady`, a pause must come after that */
export const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Release the camera in every MindAR state: started (controller + video), camera only (video, AR not
 * ready yet) or never started (nothing). Afterwards `start()` may run again.
 */
export const stopMindAR = (system: MindARSystem | null | undefined): void => {
  if (!system) return;
  const sys = system as MindARSystem & { video: HTMLVideoElement | null; controller: any };
  try {
    if (sys.controller && sys.video) {
      sys.stop();
    } else if (sys.video) {
      (sys.video.srcObject as MediaStream | null)?.getTracks().forEach(track => track.stop());
      sys.video.remove();
    }
  } catch (error) {
    console.warn("[ArScene] Stopping MindAR failed:", error);
  }
  sys.video = null;
  sys.controller = null;
};

/**
 * Before removing a scene: stop MindAR safely and make the component's own `stop()` (called on
 * removal) a no-op – it would throw for a scene that never started.
 */
export const disarmMindAR = (system: MindARSystem | null | undefined): void => {
  if (!system) return;
  stopMindAR(system);
  system.stop = () => {};
};

/** `mindar-image` attribute: no auto start (camera only in scan mode), our loading / scanning UI */
export const mindarAttribute = (mindSrc: string): string =>
  `imageTargetSrc: ${mindSrc}; maxTrack: ${getMaxTargetsPerSpread()}; autoStart: false; ` +
  `uiLoading: no; uiScanning: #osct-scanning; uiError: no`;

export const SCENE_ATTRIBUTES: Record<string, string> = {
  "color-space": "sRGB",
  renderer: "colorManagement: true, physicallyCorrectLights",
  "vr-mode-ui": "enabled: false",
  "device-orientation-permission-ui": "enabled: false",
};

export interface Anchor {
  target: Target;
  element: HTMLElement;
  entity: EntityInstance | null;
}

/**
 * Anchor entity for a target (`mindar-image-target`, element id = target id) with its registered
 * entity; found / lost go to the emitter and the entity hooks.
 */
export const buildAnchor = (
  target: Target,
  asset: (id: string) => HTMLElement | undefined,
  emitter: ArEmitter,
  found: Set<string>,
): Anchor => {
  const element = document.createElement("a-entity");
  element.id = target.id;
  element.setAttribute("mindar-image-target", `targetIndex: ${target.index}`);
  const entity = buildEntity(target, asset);
  if (entity) element.appendChild(entity.element);

  element.addEventListener("targetFound", () => {
    found.add(target.id);
    entity?.onFound?.();
    emitter.emit("targetFound", target.id);
  });
  element.addEventListener("targetLost", () => {
    found.delete(target.id);
    entity?.onLost?.();
    emitter.emit("targetLost", target.id);
  });
  return { target, element, entity };
};

/** Remove MindAR overlays it appends to the body (compatibility modal) */
export const removeMindAROverlays = (): void => {
  document.querySelectorAll(".mindar-ui-overlay").forEach(el => el.remove());
};
