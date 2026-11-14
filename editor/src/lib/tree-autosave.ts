import { getEntityRef, getTarget, getTargetsUsingEntity } from "@engine/content/game-config";
import type { EntityData } from "@engine/types";
import { putEntity, putTargetEntity } from "./api";
import { autosave, type Autosave } from "./autosave.svelte";
import { noteBaseline } from "./baselines";
import { treeBehaviourIssues } from "./behaviour-edit";
import { content } from "./content.svelte";
import { library } from "./library.svelte";
import { REMOVED_ENTITY } from "#lib/stage/frame-protocol.js";
import type { Stage } from "#lib/stage/stage.svelte.js";
import { contentTree } from "./values";

/** A target's tree as a subject of the autosaver and of *Undo edits* */
export const treeKey = (bookId: string, targetId: string): string => `tree:${bookId}:${targetId}`;

/** What of the stage the saves need: its live trees, and the two ways the draft's change reaches it */
export type TreeStage = Pick<Stage, "overrides" | "adopt" | "refresh">;

/** A tree as the draft would hold it (`null`: no AR content), for *Undo edits* and its comparison */
export const treeContent = (tree: EntityData | null | undefined): EntityData | null => (tree && tree !== REMOVED_ENTITY ? contentTree(tree) : null);

/**
 * Write a target's live tree to the draft: the shared entity when the target refers to one, else the target's own; a
 * removed root leaves the target without an entity. The draft is read again and the stage takes the tree over as the
 * draft's without building anything – it shows it already. Only a shared entity builds the spread again: its other
 * targets show it from the draft.
 */
const saveTree = async (stage: TreeStage, bookId: string, targetId: string, tree: EntityData): Promise<void> => {
  const ref = getEntityRef(targetId);
  if (tree === REMOVED_ENTITY) await putTargetEntity(bookId, targetId, null);
  else if (ref) await putEntity(bookId, ref, contentTree(tree));
  else await putTargetEntity(bookId, targetId, contentTree(tree));
  await content.load(bookId);
  if (ref && tree !== REMOVED_ENTITY && getTargetsUsingEntity(ref).length > 1) await stage.refresh();
  await stage.adopt(targetId, tree);
  // A file the tree uses now, or no longer: the Library counts its uses
  void library.refresh();
};

/**
 * The stage's live trees reach the draft by themselves (#259): every override is an edit the draft does not hold yet –
 * the Inspector's rows, a file picked or uploaded for a node, the tree's moves and removals, a gizmo drag – whichever
 * panel is open. Called whenever the overrides change (`queued` remembers which trees are on their way): a new tree of
 * a target queues its save, replacing the one still waiting; a tree whose behaviour rules are incomplete is held until
 * they are; an override that went (saved, or taken back) has nothing left to save.
 */
export const queueTreeSaves = (stage: TreeStage, bookId: string, queued: Map<string, EntityData>, saver: Autosave = autosave): void => {
  for (const [targetId, tree] of stage.overrides) {
    if (queued.get(targetId) === tree) continue;
    queued.set(targetId, tree);
    const key = treeKey(bookId, targetId);
    noteBaseline(key, treeContent(getTarget(targetId)?.entity));
    const [issue] = tree === REMOVED_ENTITY ? [] : treeBehaviourIssues(tree);
    if (issue) saver.hold(key, issue);
    else saver.queue(key, () => saveTree(stage, bookId, targetId, tree));
  }
  for (const targetId of [...queued.keys()]) {
    if (stage.overrides.has(targetId)) continue;
    queued.delete(targetId);
    saver.drop(treeKey(bookId, targetId));
  }
};
