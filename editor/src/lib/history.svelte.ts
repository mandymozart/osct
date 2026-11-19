import type { Change, RevertResult } from "@shared/api/editor";
import { errorText, getChanges, revertChanges, revertTo } from "./api";
import { autosave } from "./autosave.svelte";
import { needsPrompt, newestStep, undoable } from "./history";
import { session } from "./session.svelte";

/** A revert waiting for the person's answer: its plan and what writes it */
export interface PendingRevert {
  title: string;
  result: RevertResult;
  /** Writes the plan (the same request with `apply: true`) */
  apply: () => Promise<RevertResult>;
  /** What happens after it was written (undo and redo keep their stacks) */
  done?: (result: RevertResult) => void;
}

/** How long a notice ("Nothing to undo") stays */
const NOTICE_MS = 3500;

/**
 * The editor's **undo, redo and history** (#312): the saved changes of the experience (`GET …/changes`), the session's
 * undo and redo over the person's own saved changes, and the revert waiting for its prompt. Undo takes back the newest
 * step of the person's own changes since the page was opened (`newestStep`: one save, a burst of autosaves of one thing,
 * a revert's set) – the server writes their `before` again as new changes; redo reverts that revert. A plain undo of the
 * person's own edit runs at once; anything more – a conflict, a change that cannot be reverted, later edits of the same
 * thing or other people's changes – asks first (`pending`, `RevertPrompt.svelte`). The History panel's *Revert* and
 * *Jump back to here* always ask. Every write bumps `revision`: the page reloads the draft and its panels.
 */
class History {
  experienceId = $state<string | null>(null);
  changes = $state.raw<Change[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  /** A revert asking for the person's yes */
  pending = $state<PendingRevert | null>(null);
  busy = $state(false);
  /** A short word over the stage ("Nothing to undo") */
  notice = $state<string | null>(null);
  /** Counts the reverts written: the page reloads the draft when it changes */
  revision = $state(0);
  /** Redo: the change ids each undo wrote, newest last, with the time it was written */
  private redoStack = $state<Array<{ ids: string[]; at: number }>>([]);
  /** Changes undo took back and the reverts undo wrote: never undone again */
  private consumed = new Set<string>();
  /** The session's start: undo reaches back to here */
  private since = Date.now();
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** An experience opened: its log, and undo starts afresh (only this session's own changes) */
  enter(experienceId: string): void {
    if (this.experienceId === experienceId) return;
    this.experienceId = experienceId;
    this.changes = [];
    this.redoStack = [];
    this.consumed.clear();
    this.since = Date.now();
    void this.load();
  }

  async load(): Promise<Change[]> {
    const experienceId = this.experienceId;
    if (!experienceId) return [];
    this.loading = true;
    try {
      const { changes } = await getChanges(experienceId);
      if (this.experienceId === experienceId) {
        this.changes = changes;
        this.error = null;
      }
      return changes;
    } catch (e) {
      this.error = errorText(e);
      throw e;
    } finally {
      this.loading = false;
    }
  }

  say(text: string): void {
    this.notice = text;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = null), NOTICE_MS);
  }

  /** What waits to be saved goes first: an undo never races an autosave */
  private async settled(): Promise<boolean> {
    await autosave.flush();
    if (!autosave.unsaved) return true;
    this.say("An edit is not saved yet – undo waits until it is.");
    return false;
  }

  async undo(): Promise<void> {
    const experienceId = this.experienceId;
    const me = session.user?.email;
    if (!experienceId || !me || this.busy || this.pending) return;
    this.busy = true;
    try {
      if (!(await this.settled())) return;
      const own = undoable(await this.load(), me, this.since, this.consumed);
      const ids = newestStep(own);
      if (!ids.length) return this.say("Nothing to undo – only your own changes since the page opened.");
      const result = await revertChanges(experienceId, ids);
      const done = (written: RevertResult) => {
        for (const id of [...ids, ...written.written]) this.consumed.add(id);
        if (written.written.length) this.redoStack = [...this.redoStack, { ids: written.written, at: Date.now() }];
      };
      if (!result.plan.counts.revert) {
        // Nothing of the step can go back (a creation, a removal …): undo steps past it
        for (const id of ids) this.consumed.add(id);
        return this.say(`Cannot undo: ${result.plan.changes.find(c => c.reason)?.reason ?? "nothing to revert"}`);
      }
      const apply = () => revertChanges(experienceId, ids, true);
      if (needsPrompt(result)) this.pending = { title: "Undo", result, apply, done };
      else await this.write({ title: "Undo", result, apply, done });
    } catch (e) {
      this.say(errorText(e));
    } finally {
      this.busy = false;
    }
  }

  async redo(): Promise<void> {
    const experienceId = this.experienceId;
    const me = session.user?.email;
    const entry = this.redoStack.at(-1);
    if (!experienceId || !me || !entry || this.busy || this.pending) return;
    this.busy = true;
    try {
      if (!(await this.settled())) return;
      // A new edit since the undo: redo would write over it – the redo is gone, as in every editor
      const newer = (await this.load()).some(c => c.user === me && Date.parse(c.createdAt) > entry.at && !this.consumed.has(c.id) && !entry.ids.includes(c.id));
      if (newer) {
        this.redoStack = [];
        return this.say("Nothing to redo – you edited since.");
      }
      const result = await revertChanges(experienceId, entry.ids);
      const done = () => {
        for (const id of entry.ids) this.consumed.add(id);
        this.redoStack = this.redoStack.filter(e => e !== entry);
      };
      const apply = () => revertChanges(experienceId, entry.ids, true);
      if (needsPrompt(result) || !result.plan.counts.revert) this.pending = { title: "Redo", result, apply, done };
      else await this.write({ title: "Redo", result, apply, done });
    } catch (e) {
      this.say(errorText(e));
    } finally {
      this.busy = false;
    }
  }

  /** The History's *Revert this change*: the plan, always asked */
  async askRevert(change: Change): Promise<void> {
    const experienceId = this.experienceId;
    if (!experienceId || this.busy) return;
    await this.ask("Revert this change", () => revertChanges(experienceId, [change.id]), () => revertChanges(experienceId, [change.id], true));
  }

  /** The History's *Jump back to here*: every change after this one reverted, always asked */
  async askJump(change: Change): Promise<void> {
    const experienceId = this.experienceId;
    if (!experienceId || this.busy) return;
    await this.ask("Jump back to here", () => revertTo(experienceId, change.id), () => revertTo(experienceId, change.id, true));
  }

  private async ask(title: string, plan: () => Promise<RevertResult>, apply: () => Promise<RevertResult>): Promise<void> {
    this.busy = true;
    try {
      if (!(await this.settled())) return;
      this.pending = { title, result: await plan(), apply };
    } catch (e) {
      this.say(errorText(e));
    } finally {
      this.busy = false;
    }
  }

  /** The prompt's yes: the plan is made again on the server and written */
  async confirm(): Promise<void> {
    const pending = this.pending;
    if (!pending || this.busy) return;
    this.busy = true;
    try {
      await this.write(pending);
      this.pending = null;
    } catch (e) {
      this.say(errorText(e));
    } finally {
      this.busy = false;
    }
  }

  cancel(): void {
    this.pending = null;
  }

  private async write(pending: PendingRevert): Promise<void> {
    const result = await pending.apply();
    pending.done?.(result);
    if (result.applied) {
      const conflicts = result.plan.counts.conflict;
      this.say(`${pending.title}: ${result.written.length} change${result.written.length === 1 ? "" : "s"} reverted${conflicts ? `, ${conflicts} left as they are` : ""}.`);
      this.revision += 1;
    } else this.say(`${pending.title}: nothing could be reverted.`);
    void this.load().catch(() => undefined);
  }
}

export const history = new History();
