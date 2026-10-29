import { SvelteMap } from "svelte/reactivity";
import { ArScene } from "@engine/scene";
import { getTargets } from "@engine/content/game-config";
import { SceneState, type ArStatus, type EntityData, type IArScene } from "@engine/types";
import { MockStage } from "./mock-stage";
import { MockTracker } from "./mock-tracker";
import { getPreview, setPreviewActive, setTargetHidden } from "./preview";

/** Hide → show again: the outro (0.7 s) ends before the target is found again */
const REPLAY_GAP_MS = 900;

/**
 * The editor's stage: the engine's `ArScene` with the mock tracker and the mock stage instead of a camera, and the
 * editor's simulation of the game around it – which spread is open, which targets the "camera" sees, which were
 * found for the first time (the unlock animation plays once per target, *replay* plays it again). The reader's
 * store does none of this here: the editor owns its state.
 */
export class Stage {
  status = $state<ArStatus>("idle");
  error = $state<string | null>(null);
  spreadId = $state<string | null>(null);
  /** Targets the tracker reports found right now */
  found = $state<string[]>([]);
  /** A tap on an entity on the stage (the Entity panel selects it) */
  onTap: ((targetId: string) => void) | null = null;

  private scene: IArScene;
  private unlocked = new Set<string>();
  /** Entities shown with other values than the draft's, by target id (reactive: the panels mark them) */
  overrides = new SvelteMap<string, EntityData>();
  private replayTimer = 0;
  private cleanups: Array<() => void> = [];

  constructor(container: HTMLElement) {
    setPreviewActive(true);
    const scene = new ArScene(container, {
      createTracker: ({ container, options, scene }) => {
        const tracker = new MockTracker(container, options);
        tracker.attachStage(new MockStage(scene, container));
        return tracker;
      },
    });
    this.scene = scene;
    this.cleanups.push(
      scene.on("status", (status, error) => {
        this.status = status;
        this.error = status === "error" ? error ?? "unknown" : null;
      }),
      scene.on("targetFound", id => {
        if (!this.found.includes(id)) this.found = [...this.found, id];
        // The first find unlocks: the entity's unlock animation plays (replaces the reveal)
        if (!this.unlocked.has(id)) {
          this.unlocked.add(id);
          scene.celebrate(id);
        }
      }),
      scene.on("targetLost", id => {
        this.found = this.found.filter(found => found !== id);
      }),
      scene.on("targetTapped", id => this.onTap?.(id)),
    );
  }

  /** Show a spread on the stage (the scene runs as soon as it is asked to) */
  async open(spreadId: string): Promise<void> {
    this.spreadId = spreadId;
    this.found = [];
    await this.scene.load(spreadId);
    await this.scene.setState(SceneState.RUNNING);
  }

  /** Show a target's entity with other values than the content's (live edit), `null` = the content's again */
  override(targetId: string, entity: EntityData | null): void {
    if (entity) this.overrides.set(targetId, entity);
    else this.overrides.delete(targetId);
    this.scene.overrideEntity(targetId, entity);
  }

  overrideOf(targetId: string): EntityData | undefined {
    return this.overrides.get(targetId);
  }

  /** The colour under a point of the stage (CSS px from the container's top left), `#rrggbb` or null */
  sampleColor(x: number, y: number): string | null {
    return this.scene.sampleColor(x, y);
  }

  /** The draft changed (a save): the spread is built again from it; overrides stay until cleared */
  refresh(): Promise<void> {
    return this.scene.refresh();
  }

  /** Every shown target is locked again, hidden, and found anew: the unlock animation plays */
  replayUnlock(targetIds?: readonly string[]): void {
    const hidden = new Set(getPreview().hidden);
    const spread = this.spreadId;
    const ids = (targetIds ?? (spread ? getTargets(spread).filter(t => t.imageSrc).map(t => t.id) : [])).filter(id => !hidden.has(id));
    ids.forEach(id => {
      this.unlocked.delete(id);
      setTargetHidden(id, true);
    });
    window.clearTimeout(this.replayTimer);
    this.replayTimer = window.setTimeout(() => ids.forEach(id => setTargetHidden(id, false)), REPLAY_GAP_MS);
  }

  async dispose(): Promise<void> {
    window.clearTimeout(this.replayTimer);
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    await this.scene.dispose();
    setPreviewActive(false);
  }
}
