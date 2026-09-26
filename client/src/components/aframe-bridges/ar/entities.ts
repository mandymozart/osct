import { AssetData, EntityData, EntityType, Target } from "@/types";
import { chromaKeyMaterial, parseChromaKey } from "../utils";

/**
 * Entity registry (Phase 6, PLAN item 3): one builder per entity type creates the A-Frame element
 * for a target and may return hooks for found / lost / pause. Shared by both scene strategies
 * (`ArScene` – new scene per spread, `PersistentArScene` – one scene). Extensible (RULES #7):
 * `registerEntity("model", builder)` – no logic in content.
 */

export interface EntityInstance {
  /** Child of the target's anchor entity */
  element: HTMLElement;
  onFound?(): void;
  onLost?(): void;
  /** Scene paused (consultation, overlays) – e.g. stop video sound */
  onPause?(): void;
}

export interface EntityContext {
  target: Target;
  entity: EntityData;
  /** Asset elements of the scene (`<a-assets>`), by asset id */
  asset(id: string): HTMLElement | undefined;
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
  return builder({ target, entity, asset });
};

/** `<a-assets>` child for an asset (deduplicated by id by the caller) */
export const createAsset = (data: AssetData): HTMLElement | null => {
  const set = (el: HTMLElement, attrs: Record<string, string>) => {
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };
  switch (data.assetType) {
    case "glb":
    case "gltf":
      return set(document.createElement("a-asset-item"), { id: data.id, src: data.src });
    case "image":
      return set(document.createElement("img"), { id: data.id, src: data.src, crossorigin: "anonymous" });
    case "video":
      return set(document.createElement("video"), {
        id: data.id, src: data.src, preload: "auto", loop: "true",
        playsinline: "", "webkit-playsinline": "", crossorigin: "anonymous",
      });
    case "audio":
      return set(document.createElement("audio"), { id: data.id, src: data.src, preload: "auto", crossorigin: "anonymous" });
    default:
      console.warn(`[entities] Unknown asset type ${(data as AssetData).assetType} (${(data as AssetData).id})`);
      return null;
  }
};

const element = (tag: string, attrs: Record<string, string>): HTMLElement => {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
};

/**
 * Play with sound; if the browser blocks unmuted autoplay (no user gesture yet, e.g. iOS), play
 * muted instead of not at all. Device check: PLAN Phase 7.
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

// ── Built-in types ────────────────────────────────────────────────────────────────────────────

/** Video: plays when the target is found, pauses when lost / paused (design p.37–40); chroma key optional */
registerEntity("video", ({ entity, asset }) => {
  const data = entity.assets.find(a => a.assetType === "video");
  if (!data) return null;
  const video = asset(data.id) as HTMLVideoElement | undefined;
  const chromaKey = parseChromaKey(entity.filters);
  const el = chromaKey
    ? element("a-entity", {
        geometry: "primitive: plane; width: 1; height: 0.552",
        material: chromaKeyMaterial(data.id, chromaKey),
      })
    : element("a-video", { src: `#${data.id}`, width: "1", height: "0.552" });
  // Height from the video's own proportions (width stays 1 = target width); 16:9 until the metadata is known
  if (video) {
    const fit = () => {
      if (!video.videoWidth) return;
      const height = String(+(video.videoHeight / video.videoWidth).toFixed(4));
      if (chromaKey) el.setAttribute("geometry", `primitive: plane; width: 1; height: ${height}`);
      else el.setAttribute("height", height);
    };
    if (video.readyState >= 1) fit();
    else video.addEventListener("loadedmetadata", fit, { once: true });
  }
  // The shader resolves `src: #id` once on init – on the phone it sometimes found nothing and stayed
  // empty (transparent plane, sound only). Hand it the video element whenever its texture is missing.
  const ensureTexture = () => {
    if (!chromaKey || !video) return;
    const mesh = (el as HTMLElement & { getObject3D?: (type: string) => any }).getObject3D?.("mesh");
    const src = mesh?.material?.uniforms?.src;
    if (src && !src.value) (el.setAttribute as unknown as (name: string, prop: string, value: unknown) => void).call(el, "material", "src", video);
  };
  el.addEventListener("loaded", ensureTexture);
  return {
    element: el,
    onFound: () => {
      ensureTexture();
      if (video) void playVideo(video);
    },
    onLost: () => video?.pause(),
    onPause: () => video?.pause(),
  };
});

registerEntity("model", ({ entity }) => {
  const data = entity.assets[0];
  if (!data) return null;
  return {
    element: element("a-gltf-model", {
      src: `#${data.id}`, position: "0 -0.25 0", scale: "0.5 0.5 0.5", "animation-mixer": "",
    }),
  };
});

registerEntity("image", ({ entity }) => {
  const data = entity.assets[0];
  if (!data) return null;
  return { element: element("a-image", { src: `#${data.id}`, width: "1", height: "1" }) };
});
