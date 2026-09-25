import { Scene } from "aframe";
import { getAssets, getSpread } from "@/utils/game-config";
import { BaseArScene } from "./base-ar-scene";
import { disarmMindAR, MindARSystem, removeMindAROverlays } from "./mindar";
import { addSpreadContent, createScene, removeSpreadContent, whenLoaded } from "./scene-builder";

/** MindAR internals used for the swap (vendored build – check when upgrading MindAR) */
type PersistentMindAR = MindARSystem & {
  video: HTMLVideoElement | null;
  controller: { stopProcessVideo(): void; dispose(): void } | null;
  anchorEntities: unknown[];
  imageTargetSrc: string;
  _startAR(): Promise<void>;
};

/**
 * AR scene – strategy B ("persistent", PLAN Phase 6 spike, Tilman): **one A-Frame scene** for the whole
 * session. A spread switch keeps the scene and the camera stream; it only
 *   1. stops and disposes MindAR's tracking controller,
 *   2. swaps the anchors, entities and assets (shared assets stay),
 *   3. restarts AR on the running camera video with the new `.mind` (`_startAR`).
 * Faster switches, no camera re-request (iOS), less memory churn – but relies on MindAR internals
 * (`anchorEntities`, `imageTargetSrc`, `_startAR`). Switch strategies in `./index.ts`.
 */
export class PersistentArScene extends BaseArScene {
  protected async changeSpread(spreadId: string | null): Promise<void> {
    if (!spreadId) return this.teardown();
    const spread = getSpread(spreadId);
    if (!spread) throw new Error(`Unknown spread ${spreadId}`);

    if (!this.scene) {
      this.setStatus("loading");
      const scene = createScene(spread.mindSrc);
      this.content = addSpreadContent(scene, spreadId, this.emitter, this.found);
      this.container.appendChild(scene);
      await whenLoaded(scene);
      this.scene = scene as Scene;
      this.system = scene.systems["mindar-image-system"] as unknown as MindARSystem;
      this.setStatus("ready");
      return;
    }
    await this.swap(spreadId, spread.mindSrc);
  }

  private async swap(spreadId: string, mindSrc: string): Promise<void> {
    const system = this.system as PersistentMindAR;
    const cameraOn = !!system.video;
    this.setStatus(cameraOn ? "starting" : "loading");

    // 1. Stop tracking (the camera stream stays)
    this.pauseEntities();
    this.loseAll();
    if (system.controller) {
      try {
        system.controller.stopProcessVideo();
        system.controller.dispose();
      } catch (error) {
        console.warn("[PersistentArScene] Disposing the controller failed:", error);
      }
      system.controller = null;
    }
    this.running = false;

    // 2. Swap content – anchors register themselves on init, so reset the list first
    const nextAssets = new Set(getAssets(spreadId).map(a => a.id));
    if (this.content) removeSpreadContent(this.content, nextAssets);
    system.anchorEntities = [];
    system.imageTargetSrc = mindSrc;
    this.content = addSpreadContent(this.scene!, spreadId, this.emitter, this.found);
    await Promise.all(this.content.anchors.map(anchor => whenLoaded(anchor.element)));

    // 3. Restart tracking on the running video; with the camera off, the next start() loads the new .mind
    if (cameraOn) {
      await this.awaitArReady(() => system._startAR());
    } else {
      this.started = false;
      this.setStatus("ready");
    }
  }

  private teardown(): void {
    if (!this.scene) return;
    this.pauseEntities();
    this.loseAll();
    disarmMindAR(this.system);
    this.scene.remove();
    removeMindAROverlays();
    this.scene = null;
    this.system = null;
    this.content = null;
    this.started = false;
    this.running = false;
  }
}
