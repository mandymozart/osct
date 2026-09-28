import { AnimationMixer, DoubleSide, Group, MathUtils, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { EntityData, EntityType, resolvePlacement, Target } from "@/types";
import { chromaKeyMaterial, parseChromaKey } from "../utils/chroma-key";
import { LoadedAsset } from "./assets";

/**
 * Entity registry: one builder per entity type creates the three.js object for a target and may return hooks for
 * found / lost / pause and a per-frame update. New types: `registerEntity("type", builder)` – no logic
 * in the content. `buildEntity` puts the object into a group placed on the target by the entity's
 * `params` (position / rotation / scale – shared/types/placement.ts; axes: x right, y up the page, z out of
 * the page, 1 unit = target width, origin in its centre).
 */

export interface EntityInstance {
  /** Child of the target's anchor group (from `buildEntity`: the placement group around the builder's object) */
  object: Object3D;
  onFound?(): void;
  onLost?(): void;
  /** Scene paused (consultation, overlays) – e.g. stop video sound */
  onPause?(): void;
  /** Every rendered frame while the scene runs (seconds since the last frame) */
  update?(delta: number): void;
  /** Free what the entity created itself (not the shared assets) */
  dispose?(): void;
}

export interface EntityContext {
  target: Target;
  entity: EntityData;
  /** Loaded assets of the scene, by asset id */
  asset(id: string): LoadedAsset | undefined;
}

export type EntityBuilder = (context: EntityContext) => EntityInstance | null;

const registry = new Map<EntityType, EntityBuilder>();

export const registerEntity = (type: EntityType, builder: EntityBuilder): void => {
  registry.set(type, builder);
};

/** The target's entity, or null (no entity → the found indicator shows it as app UI) */
export const buildEntity = (target: Target, asset: EntityContext["asset"]): EntityInstance | null => {
  const entity = target.entity;
  if (!entity) return null;
  const builder = registry.get(entity.type);
  if (!builder) {
    console.warn(`[entities] No builder for entity type "${entity.type}" (target ${target.id})`);
    return null;
  }
  const instance = builder({ target, entity, asset });
  if (!instance) return null;
  const { position, rotation, scale } = resolvePlacement(entity.type, entity.params);
  const placed = new Group();
  placed.name = `${target.id}-placement`;
  placed.position.set(...position);
  placed.rotation.set(...(rotation.map(MathUtils.degToRad) as [number, number, number]));
  placed.scale.set(...scale);
  placed.add(instance.object);
  return { ...instance, object: placed };
};

/**
 * Play with sound; if the browser blocks unmuted autoplay (no user gesture yet, e.g. iOS), play
 * muted instead of not at all.
 */
export const playVideo = async (video: HTMLVideoElement): Promise<void> => {
  try {
    await video.play();
  } catch (error) {
    if ((error as DOMException)?.name !== "NotAllowedError") {
      console.warn("[entities] Could not play video:", error);
      return;
    }
    video.muted = true;
    await video.play().catch(e => console.warn("[entities] Could not play muted video:", e));
  }
};

/** Height of a video plane of width 1 until the video's proportions are known (16:9) */
export const DEFAULT_VIDEO_HEIGHT = 0.552;

/** A plane of width 1 (= target width), unlit so video and image colours show unchanged */
const plane = (material: MeshBasicMaterial | ReturnType<typeof chromaKeyMaterial>, height: number): Mesh => {
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.scale.set(1, height, 1);
  return mesh;
};

// ── Built-in types ────────────────────────────────────────────────────────────────────────────

/** Video: plays when the target is found, pauses when lost / paused; optional chroma key filter */
registerEntity("video", ({ entity, asset }) => {
  const data = entity.assets.find(a => a.assetType === "video");
  if (!data) return null;
  const loaded = asset(data.id);
  const video = loaded?.assetType === "video" ? loaded : undefined;
  const chromaKey = parseChromaKey(entity.filters);
  const material = chromaKey
    ? chromaKeyMaterial(video?.texture ?? null, chromaKey)
    : new MeshBasicMaterial({ map: video?.texture ?? null, side: DoubleSide });
  const mesh = plane(material, DEFAULT_VIDEO_HEIGHT);

  // Height from the video's own proportions (width stays 1 = target width); 16:9 until the metadata is known
  const element = video?.element;
  const fit = () => {
    if (element?.videoWidth) mesh.scale.y = +(element.videoHeight / element.videoWidth).toFixed(4);
  };
  if (element) {
    if (element.readyState >= 1) fit();
    else element.addEventListener("loadedmetadata", fit, { once: true });
  }

  return {
    object: mesh,
    onFound: () => {
      if (element) void playVideo(element);
    },
    onLost: () => element?.pause(),
    onPause: () => element?.pause(),
    dispose: () => {
      element?.removeEventListener("loadedmetadata", fit);
      mesh.geometry.dispose();
      material.dispose();
    },
  };
});

/** glTF model; all of its animation clips play */
registerEntity("model", ({ entity, asset }) => {
  const data = entity.assets[0];
  const loaded = data && asset(data.id);
  if (!loaded || (loaded.assetType !== "glb" && loaded.assetType !== "gltf")) return null;
  // A copy per entity (skinned meshes need SkeletonUtils) – geometries and materials stay shared
  const model = cloneSkinned(loaded.scene); // placed by `params` (default: standing on the page, half size)
  const mixer = loaded.animations.length ? new AnimationMixer(model) : null;
  loaded.animations.forEach(clip => mixer!.clipAction(clip).play());
  return {
    object: model,
    update: delta => mixer?.update(delta),
    dispose: () => mixer?.stopAllAction(),
  };
});

registerEntity("image", ({ entity, asset }) => {
  const data = entity.assets[0];
  const loaded = data && asset(data.id);
  const material = new MeshBasicMaterial({
    map: loaded?.assetType === "image" ? loaded.texture : null,
    side: DoubleSide,
    transparent: true,
  });
  const mesh = plane(material, 1);
  return {
    object: mesh,
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
});
