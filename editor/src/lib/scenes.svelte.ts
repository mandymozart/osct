import { addGroup, addScene, deleteGroup, getBook, listScenes, moveScenes, putGroup, putScene, putSurfaceReference, type BookTree, type ScenePlace, type TreeSpread } from "./api";
import type { GroupData, SceneLayout, SurfaceData } from "@shared/types/game-config";
import type { ScenePreset, SurfaceReference, SurfaceReferenceRequest } from "@shared/api/editor";
import { groupedOf, newGroupLabel, ungroupPlan, type MoveRequest } from "./scene-strip";

/**
 * The book's scenes and groups for the Scenes panel, the book page's scene cards and the Inspector's scene and group
 * (#307 phase 3a): the book's tree (`GET /editor/books/{id}` – the scenes in order with their entries, the groups) read
 * once per book, and the actions on it – add a scene from a preset, move scenes (a drop), group and ungroup, a scene's
 * label / layout / group / surfaces, a group's label. Every action reads the tree again; `version` goes up with each, so
 * a page that shows the draft (the stage, its ‹ ›) can follow. The logic of the strip is `scene-strip.ts`.
 */
class Scenes {
  bookId = $state<string | null>(null);
  tree = $state<BookTree | null>(null);
  error = $state<unknown>(null);
  /** Goes up whenever an action here changed the book (the order, a group, a scene's fields) */
  version = $state(0);
  /** The picked scenes (in order) and the Shift range's anchor – shared by the strip and its toolbar */
  picks = $state<{ picked: string[]; anchor: string | null }>({ picked: [], anchor: null });

  get list(): TreeSpread[] {
    return this.tree?.spreads ?? [];
  }

  get groups(): GroupData[] {
    return this.tree?.groups ?? [];
  }

  scene(id: string): TreeSpread | undefined {
    return this.list.find(scene => scene.id === id);
  }

  group(id: string): GroupData | undefined {
    return this.groups.find(group => group.id === id);
  }

  /** Read the book's tree (again with `fresh`: what others changed meanwhile) */
  async load(bookId: string, fresh = false): Promise<void> {
    if (this.bookId !== bookId) {
      this.tree = null;
      this.references = {};
      this.picks = { picked: [], anchor: null };
    }
    this.bookId = bookId;
    void this.loadReferences().catch(() => { /* the stage keeps the page images and sheets */ });
    try {
      const tree = await getBook(bookId, { fresh });
      if (this.bookId === bookId) {
        this.tree = tree;
        this.error = null;
        const ids = new Set(tree.spreads.map(s => s.id));
        this.picks = { picked: this.picks.picked.filter(id => ids.has(id)), anchor: this.picks.anchor && ids.has(this.picks.anchor) ? this.picks.anchor : null };
      }
    } catch (e) {
      this.error = e;
    }
  }

  /** After a write: the tree again (the write dropped the cached one), and `version` for the pages that follow */
  private async changed(): Promise<void> {
    if (this.bookId) await this.load(this.bookId);
    this.version += 1;
  }

  private get id(): string {
    if (!this.bookId) throw new Error("No book loaded.");
    return this.bookId;
  }

  /** A new scene from a preset, after `after` (none: the API's default place); its id */
  async add(preset: ScenePreset, place?: ScenePlace): Promise<string> {
    const added = await addScene(this.id, { preset, ...(place ?? {}) });
    await this.changed();
    return added.scene.id;
  }

  /** A drop: the move written in one go – the drop was the confirmation */
  async move(request: MoveRequest): Promise<void> {
    await moveScenes(this.id, { ...request, apply: true });
    await this.changed();
  }

  /** Ctrl+G: a new group of the picked scenes (they come together where the first is); its id */
  async groupPicked(): Promise<string | null> {
    const picked = this.picks.picked;
    if (!picked.length) return null;
    const planned = await addGroup(this.id, { label: newGroupLabel(this.groups), scenes: picked, apply: true });
    await this.changed();
    return planned.plan.group.id;
  }

  /**
   * Ctrl+Shift+G: the group itself (its band selected) goes, else the picked scenes leave theirs, in place – a group whose
   * scenes are all picked goes as a whole (no empty group stays behind)
   */
  async ungroup(groupId: string | null): Promise<void> {
    if (groupId) await deleteGroup(this.id, groupId);
    else {
      const picked = groupedOf(this.list, this.picks.picked);
      if (!picked.length) return;
      const { whole, leaving } = ungroupPlan(this.list, picked);
      for (const id of whole) await deleteGroup(this.id, id);
      if (leaving.length) await moveScenes(this.id, { scenes: leaving, group: null, apply: true });
    }
    await this.changed();
  }

  async renameGroup(groupId: string, label: string): Promise<void> {
    await putGroup(this.id, groupId, label);
    await this.changed();
  }

  /**
   * A scene's label, layout, group or surfaces (the whole list); `apply` lets a surface go that entries lie on (they keep
   * their side, #314)
   */
  async putScene(sceneId: string, body: { label?: string | null; layout?: SceneLayout | null; group?: string | null; surfaces?: SurfaceData[]; apply?: boolean }): Promise<void> {
    await putScene(this.id, sceneId, body);
    await this.changed();
  }

  /**
   * The surfaces' reference images (#314, editor-only) by scene id and surface id, from the scenes overview
   * (`GET …/scenes`) – read with every change here (`version`), so the stage and the Inspector follow
   */
  references = $state<Record<string, Record<string, SurfaceReference>>>({});
  private referencesRun = 0;

  /** Read the reference images again (the stage shows them, the Inspector's surface names them) */
  async loadReferences(): Promise<void> {
    const bookId = this.bookId;
    if (!bookId) return;
    const run = ++this.referencesRun;
    const list = await listScenes(bookId);
    if (run !== this.referencesRun || this.bookId !== bookId) return;
    const refs: Record<string, Record<string, SurfaceReference>> = {};
    for (const scene of list.scenes) {
      for (const surface of scene.surfaces) if (surface.reference) (refs[scene.id] ??= {})[surface.id] = surface.reference;
    }
    this.references = refs;
  }

  reference(sceneId: string, surfaceId: string): SurfaceReference | null {
    return this.references[sceneId]?.[surfaceId] ?? null;
  }

  /** Set, replace (`url`), change (`fit`, `name`) or remove (`url: null`) a surface's reference image (#314) */
  async putReference(sceneId: string, surfaceId: string, body: SurfaceReferenceRequest): Promise<void> {
    await putSurfaceReference(this.id, sceneId, surfaceId, body);
    await this.loadReferences();
    this.version += 1;
  }
}

export const scenes = new Scenes();
