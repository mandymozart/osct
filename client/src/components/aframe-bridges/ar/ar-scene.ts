import { Scene } from "aframe";
import { getSpread } from "@/utils/game-config";
import { BaseArScene } from "./base-ar-scene";
import { disarmMindAR, MindARSystem, removeMindAROverlays } from "./mindar";
import { addSpreadContent, createScene, whenLoaded } from "./scene-builder";

/**
 * AR scene – strategy A ("rebuild", PLAN Phase 6 default): a **new A-Frame scene per spread**.
 * Proven approach – replacing the scene lets A-Frame / MindAR reset completely; the camera restarts on
 * each spread switch. Strategy B keeps one scene: `PersistentArScene`.
 */
export class ArScene extends BaseArScene {
  protected async changeSpread(spreadId: string | null): Promise<void> {
    this.teardown();
    if (spreadId) await this.build(spreadId);
  }

  private async build(spreadId: string): Promise<void> {
    const spread = getSpread(spreadId);
    if (!spread) throw new Error(`Unknown spread ${spreadId}`);
    this.setStatus("loading");

    const scene = createScene(spread.mindSrc);
    const content = addSpreadContent(scene, spreadId, this.emitter, this.found);
    this.container.appendChild(scene);
    await whenLoaded(scene);

    this.scene = scene as Scene;
    this.system = scene.systems["mindar-image-system"] as unknown as MindARSystem;
    this.content = content;
    this.started = false;
    this.running = false;
    this.setStatus("ready");
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
