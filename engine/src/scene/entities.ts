import { AnimationAction, AnimationMixer, CanvasTexture, DoubleSide, Group, LoopOnce, LoopRepeat, MathUtils, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, ShaderMaterial, SRGBColorSpace } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { EntityData, EntityType, NodeTimeline, resolveComponent, resolvePlacement, Target } from "../types/index";
import { chromaKeyMaterial, parseChromaKey, setChromaKey } from "../utils/chroma-key";
import { LoadedAsset } from "./assets";
import { getBook, getEntry } from "../content/game-config";

/**
 * Entity registry: one builder per node type creates the three.js object for a node and may return hooks for
 * found / lost / pause and a per-frame update. New types: `registerEntity("type", builder)` – no logic
 * in the content. `buildEntity` builds the entity's **node tree** (content schema 2.0): every node's object goes
 * into a group placed by the node's `params` (position / rotation / scale – shared/types/placement.ts; axes: x
 * right, y up the page, z out of the page, 1 unit = target width, origin in its centre) relative to its parent, the
 * root on the target's anchor. A node of a type without a builder renders nothing (logged) but keeps its children.
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
  /**
   * Apply other filter values in place (the editor's live edit); false when it can't – the scene builds the entity anew.
   * Placement is applied by the scene (`placeEntity`).
   */
  tune?(entity: EntityData): boolean;
  /** The placement group of every node of the tree by its path (`""` = the root, `"1.0"` = the second child's first) – editor tools */
  nodes?: Record<string, Object3D>;
  /** A tap on the entity (the scene's hit test found it): a component may react (the animation's `playOn: tap`) */
  onTap?(): void;
  /** A model node's animation for the editor's timeline */
  timeline?: NodeTimeline;
  /** The timelines of every node of the tree by its path – editor tools */
  timelines?: Record<string, NodeTimeline>;
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

/** The target's entity (its whole node tree), or null (no entity → the found indicator shows it as app UI) */
export const buildEntity = (target: Target, asset: EntityContext["asset"]): EntityInstance | null =>
  target.entity ? buildNode(target, target.entity, asset, target.id) : null;

/** One node: its own object (if its type has a builder) and its children, in a group placed by its params */
const buildNode = (target: Target, node: EntityData, asset: EntityContext["asset"], name: string): EntityInstance | null => {
  const builder = registry.get(node.type);
  if (!builder) console.warn(`[entities] No builder for node type "${node.type}" (target ${target.id})`);
  const own = builder ? builder({ target, entity: node, asset }) : null;
  const children = (node.children ?? [])
    .map((child, i) => buildNode(target, child, asset, `${name}.${i}`))
    .filter((child): child is EntityInstance => child !== null);
  if (!own && !children.length) return null;
  const placed = new Group();
  placed.name = `${name}-placement`;
  placeEntity(placed, node);
  if (own) placed.add(own.object);
  children.forEach(child => placed.add(child.object));
  const all = own ? [own, ...children] : children;
  const nodes: Record<string, Object3D> = { "": placed };
  const timelines: Record<string, NodeTimeline> = {};
  if (own?.timeline) timelines[""] = own.timeline;
  children.forEach((child, i) => {
    Object.entries(child.nodes ?? {}).forEach(([key, object]) => (nodes[key === "" ? `${i}` : `${i}.${key}`] = object));
    Object.entries(child.timelines ?? {}).forEach(([key, timeline]) => (timelines[key === "" ? `${i}` : `${i}.${key}`] = timeline));
  });
  return {
    object: placed,
    nodes,
    timelines,
    onTap: () => all.forEach(part => part.onTap?.()),
    onFound: () => all.forEach(part => part.onFound?.()),
    onLost: () => all.forEach(part => part.onLost?.()),
    onPause: () => all.forEach(part => part.onPause?.()),
    update: delta => all.forEach(part => part.update?.(delta)),
    dispose: () => all.forEach(part => part.dispose?.()),
    // The same tree shape with other values: every node tunes in place and is placed again; else rebuild
    tune: tuned => {
      if (tuned.type !== node.type) return false;
      const next = tuned.children ?? [];
      if (next.length !== children.length || (node.children ?? []).length !== next.length) return false;
      if (own && !(own.tune?.(tuned) ?? true)) return false;
      for (let i = 0; i < children.length; i++) {
        if (!children[i].tune!(next[i])) return false;
        placeEntity(children[i].object, next[i]);
      }
      return true;
    },
  };
};

/** Set the placement group's transform from the entity's `params` (defaults per type) */
export const placeEntity = (placed: Object3D, entity: EntityData): void => {
  const { position, rotation, scale } = resolvePlacement(entity.type, entity.params);
  placed.position.set(...position);
  placed.rotation.set(...(rotation.map(MathUtils.degToRad) as [number, number, number]));
  placed.scale.set(...scale);
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
    // A keyed video stays keyed: new values go into the uniforms; adding or removing the key needs a new material
    tune: tuned => {
      const key = parseChromaKey(tuned.filters);
      if (!chromaKey || !key || !(material instanceof ShaderMaterial)) return !chromaKey && !key;
      setChromaKey(material, key);
      return true;
    },
    dispose: () => {
      element?.removeEventListener("loadedmetadata", fit);
      mesh.geometry.dispose();
      material.dispose();
    },
  };
});

/**
 * glTF model. Without an `animation` component every clip plays in a loop (as before 2.2). With one, the chosen
 * clip (or the first) plays when the component says (`playOn`: found / tap / never), stops when the page is lost
 * (`stopOn`), loops or holds its last frame, at `speed` – and the editor's timeline drives it directly.
 */
registerEntity("model", ({ entity, asset }) => {
  const data = entity.assets[0];
  const loaded = data && asset(data.id);
  if (!loaded || (loaded.assetType !== "glb" && loaded.assetType !== "gltf")) return null;
  // A copy per entity (skinned meshes need SkeletonUtils) – geometries and materials stay shared
  const model = cloneSkinned(loaded.scene); // placed by `params` (default: standing on the page, half size)
  const clips = loaded.animations;
  const mixer = clips.length ? new AnimationMixer(model) : null;
  let animation = resolveComponent(entity.components, "animation");
  let action: AnimationAction | null = null;
  let current = "";

  const clipByName = (name: string) => clips.find(clip => clip.name === name) ?? clips[0];
  /** The action of the component's clip with its loop and speed (a change of clip swaps the action) */
  const arm = (): AnimationAction | null => {
    if (!mixer || !clips.length) return null;
    const clip = clipByName(String(animation?.clip ?? ""));
    if (action && current !== clip.name) {
      action.stop();
      action = null;
    }
    current = clip.name;
    action ??= mixer.clipAction(clip);
    const loop = animation ? animation.loop !== false : true;
    action.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.timeScale = Number(animation?.speed ?? 1);
    return action;
  };
  const playing = () => !!action && action.isRunning();

  if (!animation) {
    clips.forEach(clip => mixer!.clipAction(clip).play());
  } else {
    arm();
  }

  const timeline: NodeTimeline | undefined = mixer
    ? {
        clips: clips.map(clip => ({ name: clip.name, duration: clip.duration })),
        state: () => {
          const a = action ?? arm();
          return { clip: current, time: a?.time ?? 0, playing: playing(), duration: a?.getClip().duration ?? 0 };
        },
        play: name => {
          if (name !== undefined) animation = { ...(animation ?? resolveComponent([{ type: "animation" }], "animation")!), clip: name };
          const a = arm();
          if (!a) return;
          a.paused = false;
          a.enabled = true;
          if (!a.isRunning()) a.reset().play();
        },
        pause: () => { if (action) action.paused = true; },
        seek: time => {
          const a = action ?? arm();
          if (!a) return;
          if (!a.isRunning()) { a.play(); a.paused = true; }
          a.time = Math.max(0, Math.min(a.getClip().duration, time));
          mixer.update(0);
        },
      }
    : undefined;

  return {
    object: model,
    timeline,
    update: delta => mixer?.update(delta),
    onFound: () => { if (animation && animation.playOn === "found") timeline?.play(); },
    onLost: () => { if (animation && animation.stopOn === "lost" && action) { action.stop(); } },
    onTap: () => { if (animation && animation.playOn === "tap") timeline?.play(); },
    // Other component values apply in place: clip, loop, speed; a component added or removed rebuilds
    tune: tuned => {
      const next = resolveComponent(tuned.components, "animation");
      if (!!next !== !!animation) return false;
      const wasPlaying = playing();
      animation = next;
      if (animation) {
        arm();
        if (wasPlaying && !playing()) timeline?.play();
      }
      return true;
    },
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

/** A group only holds children (placed by its params) */
registerEntity("group", () => ({ object: new Group() }));

/** Text: one line on a plane of width 1, drawn on a canvas (system serif) – `{{entry.title}}` is the entry's title */
const TEXT_CANVAS_WIDTH = 1024;
const TEXT_FONT_PX = 112;
registerEntity("text", ({ target, entity }) => {
  const text = (entity.text ?? "")
    .replace(/\{\{\s*entry\.title\s*\}\}/g, getEntry(target.entryId)?.title ?? "")
    .replace(/\{\{\s*book\.title\s*\}\}/g, getBook().title)
    .trim() || " ";
  const color = entity.color && /^#[0-9a-f]{6}$/i.test(entity.color) ? entity.color : "#ffffff";
  const canvas = document.createElement("canvas");
  canvas.width = TEXT_CANVAS_WIDTH;
  canvas.height = Math.round(TEXT_FONT_PX * 1.5);
  const context = canvas.getContext("2d");
  if (context) {
    context.font = `${TEXT_FONT_PX}px Georgia, "Times New Roman", serif`;
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillStyle = color;
    // Shrink long lines to the plane's width
    const width = context.measureText(text).width;
    if (width > TEXT_CANVAS_WIDTH * 0.96) context.font = `${Math.floor((TEXT_FONT_PX * TEXT_CANVAS_WIDTH * 0.96) / width)}px Georgia, "Times New Roman", serif`;
    context.fillText(text, TEXT_CANVAS_WIDTH / 2, canvas.height / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, side: DoubleSide });
  const mesh = plane(material, canvas.height / TEXT_CANVAS_WIDTH);
  return {
    object: mesh,
    // Another text or colour needs a new canvas: the scene rebuilds the node
    tune: tuned => (tuned.text ?? "") === (entity.text ?? "") && (tuned.color ?? "") === (entity.color ?? ""),
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
});
