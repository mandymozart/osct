import type { Object3D } from "three";

/**
 * Nodes hidden on the stage by the tree's eye (#311): the editor's debugging view of a complex tree, never the content.
 *
 * A hidden node's placement group and everything under it (its children's nodes, its meshes, a light) leave the
 * camera's layers – the renderer draws none of them and the stage's picking (a raycaster on the same layers) passes
 * through them. Not `visible`: the engine switches that itself (a behaviour's show and hide, a lost target), so the
 * stage would either fight it or forget what it set. Applied every frame from the node objects as they are now, so it
 * holds through a rebuilt entity (a draft change, a model that loads late); what is no longer hidden gets its own
 * layers back.
 */
export class NodeHiding {
  /** Every object taken off the layers, with the layers it had */
  private taken = new Map<Object3D, number>();

  /** Hide these node objects with their subtrees, show again what was hidden before and is not in them */
  apply(roots: readonly Object3D[]): void {
    if (!roots.length && !this.taken.size) return;
    const now = new Set<Object3D>();
    for (const root of roots) root.traverse(object => void now.add(object));
    for (const [object, mask] of this.taken) {
      if (now.has(object)) continue;
      object.layers.mask = mask;
      this.taken.delete(object);
    }
    for (const object of now) {
      if (this.taken.has(object)) {
        // Something gave it layers again meanwhile (an outline, a helper): off once more, that mask is its own now
        if (object.layers.mask !== 0) {
          this.taken.set(object, object.layers.mask);
          object.layers.mask = 0;
        }
        continue;
      }
      this.taken.set(object, object.layers.mask);
      object.layers.mask = 0;
    }
  }

  /** Everything hidden shows again */
  clear(): void {
    this.apply([]);
  }

  /** How many objects are off the layers now (tests) */
  get size(): number {
    return this.taken.size;
  }
}
