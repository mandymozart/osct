import { Scene } from "aframe";
import { getAssets, getTargets } from "@/utils/game-config";
import { createAsset } from "./entities";
import { Anchor, ArEmitter, buildAnchor, mindarAttribute, SCENE_ATTRIBUTES, waitForEvent } from "./mindar";

/**
 * Building blocks of the AR scene: an empty scene (assets, camera, MindAR attribute) and a spread's
 * content (assets + anchors with their entities) that is added to and removed from it.
 */

export interface SpreadContent {
  spreadId: string;
  /** Asset elements added for this spread (shared ids that were already there are not listed) */
  assets: HTMLElement[];
  anchors: Anchor[];
}

/** `<a-scene>` with `<a-assets>` and the camera – MindAR not started (autoStart: false) */
export const createScene = (mindSrc: string): Scene => {
  const scene = document.createElement("a-scene") as Scene;
  scene.id = "scene";
  Object.entries(SCENE_ATTRIBUTES).forEach(([k, v]) => scene.setAttribute(k, v));
  scene.setAttribute("mindar-image", mindarAttribute(mindSrc));
  scene.appendChild(document.createElement("a-assets"));
  const camera = document.createElement("a-camera");
  camera.setAttribute("position", "0 0 0");
  camera.setAttribute("look-controls", "enabled: false");
  scene.appendChild(camera);
  return scene;
};

const assetsOf = (scene: Element): HTMLElement => scene.querySelector("a-assets") as HTMLElement;

/** Add a spread's assets (deduplicated by id) and target anchors to a scene */
export const addSpreadContent = (
  scene: Element,
  spreadId: string,
  emitter: ArEmitter,
  found: Set<string>,
): SpreadContent => {
  const container = assetsOf(scene);
  const added: HTMLElement[] = [];
  getAssets(spreadId).forEach(data => {
    if (container.querySelector(`#${CSS.escape(data.id)}`)) return;
    const el = createAsset(data);
    if (!el) return;
    container.appendChild(el);
    added.push(el);
  });
  const asset = (id: string) => (container.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null) ?? undefined;
  const anchors = getTargets(spreadId).map(target => buildAnchor(target, asset, emitter, found));
  anchors.forEach(anchor => scene.appendChild(anchor.element));
  return { spreadId, assets: added, anchors };
};

/** Remove a spread's anchors and the assets it added (except ids the next spread still needs) */
export const removeSpreadContent = (content: SpreadContent, keepAssetIds: Set<string> = new Set()): void => {
  content.anchors.forEach(anchor => {
    anchor.entity?.onPause?.();
    anchor.element.remove();
  });
  content.assets.forEach(asset => {
    if (keepAssetIds.has(asset.id)) return;
    if (asset instanceof HTMLMediaElement) {
      asset.pause();
      asset.removeAttribute("src");
      asset.load(); // release the media buffer
    }
    asset.remove();
  });
};

/** Wait until A-Frame has initialised an element (components such as `mindar-image-target`) */
export const whenLoaded = async (el: Element & { hasLoaded?: boolean }): Promise<void> => {
  if (!el.hasLoaded) await waitForEvent(el, "loaded", { timeout: 30000 });
};
