import type * as THREE from "three";
import type { Matrix4, Object3D, PerspectiveCamera, Texture } from "three";
import {
  type AppearanceData, type AppearanceSpec, CARD_LOOKS, type CardFlightValues, DEFAULT_CARD_LOOK_TYPE, isBuiltInCardLookType,
  registerCardLookSpec, resolveAppearance, unregisterCardLookSpec,
} from "../types/index";
import { CardFlight, defaultCardBack, endDistance } from "./card-flight";

/**
 * Card looks (#361): how the marginalia card is picked up – a glossary target found in scan mode flies its card, and the
 * entry opens once it has landed (#285). The experience names one in `appearance.card` (`shared/types/card-look.ts`): the
 * built-in `cardFlight` (`./card-flight.ts`, played from its values) or one a plugin registers here through the plugin
 * API's `registerCardLook` – it then plays in the built-in one's place.
 *
 *   api.registerCardLook("drop", SPEC, ({ three, scene, camera, front, aspect, landing }) => {
 *     const card = new three.Mesh(new three.PlaneGeometry(1, aspect), new three.MeshBasicMaterial({ map: front }));
 *     scene.add(card);
 *     return {
 *       duration: 900,
 *       update: t => { … card.position / card.quaternion from the camera and t … },
 *       dispose: () => { card.removeFromParent(); card.geometry.dispose(); card.material.dispose(); },
 *     };
 *   });
 */

/** What a card look's factory gets, once per flight */
export interface CardLookContext<P = Record<string, unknown>> {
  /** The look's parameters with the spec's defaults filled in */
  params: P;
  /** The app's three.js (one instance – a plugin never imports three itself) */
  three: typeof THREE;
  /**
   * The AR camera. The three.js camera stays at the origin and looks down −z; the page's anchor is placed relative to it
   * (1 unit = the target's width). Read its matrices every frame: the projection follows the screen
   */
  camera: PerspectiveCamera;
  /** The AR scene: add the card's objects here and remove them in `dispose` */
  scene: Object3D;
  /**
   * The page the card leaves: the target's anchor – x to the right, y to the top of the page, z out of it, its scale the
   * target's width. It follows the page while the page is found (`found()`), else it keeps its last pose
   */
  anchor: Object3D;
  /** Whether the page is still found right now */
  found(): boolean;
  /** The printed picture (the target's image) – the engine owns the textures: never dispose them */
  front: Texture;
  /** The card's back: the book's cover, else a default pattern */
  back: Texture;
  /** The entry's own picture in full resolution, to show once the card has landed – null when it is the printed one */
  reveal: Texture | null;
  /** The picture's height / width */
  aspect: number;
  /**
   * How far in front of the camera a card `width` wide (and `width · aspect` high) fills `fill` of the screen in both
   * directions – where the built-in flight lands (`fill` default 0.62)
   */
  landing(width: number, fill?: number): number;
  /** Let the phone vibrate (where it can; nothing elsewhere) */
  vibrate(pattern: number | number[]): void;
}

/** One running flight of a card look */
export interface CardLookRun {
  /** ms of the whole flight – the entry opens when it is over, over the card, which stays a moment longer */
  duration: number;
  /** One frame: `t` from 0 to 1 over `duration`, `delta` the seconds since the last frame */
  update(t: number, delta: number): void;
  /** Remove and free what the look created (the engine frees the textures) */
  dispose?(): void;
}

export type CardLookFactory<P = Record<string, unknown>> = (context: CardLookContext<P>) => CardLookRun;

export interface CardLookRegistration {
  owner: string;
  spec: AppearanceSpec;
  factory: CardLookFactory;
}

const registry = new Map<string, CardLookRegistration>();

/** Register a card look; a type registered by another owner is refused, the same owner replaces its own */
export const registerCardLook = (type: string, spec: AppearanceSpec, factory: CardLookFactory, owner: string): void => {
  const existing = registry.get(type);
  if (existing && existing.owner !== owner) throw new Error(`The card look "${type}" is registered by ${existing.owner}`);
  registry.set(type, { owner, spec, factory });
  registerCardLookSpec(type, spec);
};

/** Every card look an owner registered leaves the registry (a plugin is uninstalled) */
export const unregisterCardLooksOf = (owner: string): void => {
  registry.forEach((registration, type) => {
    if (registration.owner !== owner) return;
    registry.delete(type);
    unregisterCardLookSpec(type);
  });
};

export const cardLookRegistration = (type: string): CardLookRegistration | undefined => registry.get(type);

export const registeredCardLookTypes = (): string[] => [...registry.keys()];

/** A flight as the AR scene drives it: one frame (false once it is over), then remove it */
export interface CardPlay {
  step(delta: number, anchor: Matrix4 | null, camera: PerspectiveCamera): boolean;
  dispose(): void;
}

export interface CardPictures {
  front: Texture;
  back: Texture | null;
  reveal: Texture | null;
  aspect: number;
}

/**
 * The flight `look` names, started: a plugin's card look when one is registered for its type, else the built-in
 * `cardFlight` – with the look's values when it names the built-in one, with its defaults when it names a type nobody
 * registered (a plugin that failed to load). The play owns the pictures and frees them.
 */
export const playCardLook = (
  look: AppearanceData | undefined,
  pictures: CardPictures,
  stage: { scene: Object3D; anchor: Object3D; camera: PerspectiveCamera; found: () => boolean; three: typeof THREE },
): CardPlay => {
  const type = look?.type ?? DEFAULT_CARD_LOOK_TYPE;
  const registration = isBuiltInCardLookType(type) ? undefined : registry.get(type);
  if (registration) {
    try {
      return pluginPlay(registration, look!, pictures, stage);
    } catch (error) {
      console.error(`[card look ${type}] failed to start – the built-in flight plays`, error);
    }
  } else if (!isBuiltInCardLookType(type)) {
    console.warn(`[card look] "${type}" is registered by no plugin – the built-in flight plays`);
  }
  const values = isBuiltInCardLookType(type) && look ? (resolveAppearance(CARD_LOOKS[type], look) as unknown as CardFlightValues) : {};
  const flight = new CardFlight(stage.anchor.matrix, pictures.front, pictures.aspect, pictures.back, undefined, pictures.reveal, values);
  stage.scene.add(flight.object);
  return {
    step: (delta, anchor, camera) => flight.update(delta, anchor, camera),
    dispose: () => flight.dispose(),
  };
};

/** A plugin's card look, driven by the engine's clock: `t` over its duration; its errors end it, never the scene */
const pluginPlay = (
  registration: CardLookRegistration,
  look: AppearanceData,
  pictures: CardPictures,
  stage: { scene: Object3D; anchor: Object3D; camera: PerspectiveCamera; found: () => boolean; three: typeof THREE },
): CardPlay => {
  const back = pictures.back ?? defaultCardBack();
  const textures = [pictures.front, back, ...(pictures.reveal ? [pictures.reveal] : [])];
  const run = registration.factory({
    params: resolveAppearance(registration.spec, look),
    three: stage.three,
    camera: stage.camera,
    scene: stage.scene,
    anchor: stage.anchor,
    found: stage.found,
    front: pictures.front,
    back,
    reveal: pictures.reveal,
    aspect: pictures.aspect,
    landing: (width, fill) => endDistance(stage.camera.projectionMatrix, width, pictures.aspect, fill),
    vibrate: pattern => {
      if (typeof navigator !== "undefined") navigator.vibrate?.(pattern);
    },
  });
  const duration = Number.isFinite(run?.duration) && run.duration > 0 ? run.duration : 0;
  let elapsed = 0;
  let failed = false;
  return {
    step: delta => {
      if (failed) return false;
      elapsed += delta * 1000;
      const t = duration ? Math.min(1, elapsed / duration) : 1;
      try {
        run.update(t, delta);
      } catch (error) {
        failed = true;
        console.error(`[card look] update failed – the flight ends`, error);
        return false;
      }
      return elapsed < duration;
    },
    dispose: () => {
      try {
        run.dispose?.();
      } catch (error) {
        console.error(`[card look] dispose failed`, error);
      }
      textures.forEach(texture => texture.dispose());
    },
  };
};
