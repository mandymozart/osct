import type { ProgressReader, VarValue } from "@engine/scene";

/**
 * The editor's simulation of a reader's progress for the plugins' book API (`api.progress`, the `book` scope of
 * `api.vars`): which targets were found for the first time on this stage, and the book variables the plugins set.
 * It lives as long as the workspace is open – nothing of the reader's stored progress is involved (RULES #32); the
 * editor has no entry view, so nothing is ever consulted.
 */
export class StageProgress {
  readonly unlocked = new Set<string>();
  private readonly variables = new Map<string, VarValue>();

  /** What the engine gets (`ArSceneOptions.progress`) */
  reader(): ProgressReader {
    return {
      unlocked: targetId => this.unlocked.has(targetId),
      consulted: () => false,
      variables: {
        get: name => this.variables.get(name),
        set: (name, value) => {
          if (value === null) this.variables.delete(name);
          else this.variables.set(name, value);
        },
        all: () => Object.fromEntries(this.variables),
      },
    };
  }

  /** The first find of a target: true once per target until a reset or a replay */
  unlock(targetId: string): boolean {
    if (this.unlocked.has(targetId)) return false;
    this.unlocked.add(targetId);
    return true;
  }

  /** Lock the targets again (a replay plays the first find once more) */
  lock(targetIds: Iterable<string>): void {
    for (const id of targetIds) this.unlocked.delete(id);
  }

  /** A new game: nothing found, no book variable */
  reset(): void {
    this.unlocked.clear();
    this.variables.clear();
  }
}
