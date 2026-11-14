import { SvelteMap } from "svelte/reactivity";
import { ApiError, errorText } from "./api";
import { trackUnsaved } from "./unsaved";

/** How long after a subject's last edit its save starts: a drag or a word being typed is not saved half-way */
export const AUTOSAVE_DELAY_MS = 800;
/** How long after a save the server or the network failed it is tried again */
export const AUTOSAVE_RETRY_MS = 8000;

/** Where the autosaver stands, for the top bar: the newest state that matters to the person */
export type AutosaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "held"; reason: string }
  | { state: "failed"; message: string };

type Save = () => Promise<void>;

/** A failure worth trying again by itself: the network, or the server's own error – never a refusal of the request */
const isTransient = (error: unknown): boolean => !(error instanceof ApiError) || error.status >= 500;

/**
 * The editor's autosave (#259): every edit reaches the draft by itself. A panel queues a save for its **subject**
 * (a key: a target's tree, a spread's passes, an entry, …) with each edit; the save starts once the subject was left
 * alone for a moment, and a newer save of the same subject replaces the one still waiting. Saves run one after another,
 * in the order they became due, so the draft never gets them out of order. A save carries what it writes: it runs after
 * the panel that queued it is gone.
 *
 * A failed save stays (`failed`) until its subject is edited again, **Retry**, or – when the server or the network
 * failed it – the next try a few seconds later. A subject may be **held**: something keeps it from being saved (a rule
 * that is not complete yet), which the top bar says. `unsaved` is true while anything waits, runs, failed or is held –
 * a reload would lose it (`unsaved.ts`).
 */
export class Autosave {
  private readonly pending = new Map<string, { run: Save; due: number }>();
  private readonly failures = new Map<string, Save>();
  private readonly holds = new SvelteMap<string, string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private chain: Promise<void> = Promise.resolve();

  /** Saves waiting for their moment, saves running or in line, and the newest failure's words */
  private waiting = $state(0);
  private running = $state(0);
  private failure = $state<string | null>(null);
  private savedOnce = $state(false);

  constructor(private readonly delay = AUTOSAVE_DELAY_MS, private readonly retryDelay = AUTOSAVE_RETRY_MS) {}

  get status(): AutosaveStatus {
    if (this.waiting > 0 || this.running > 0) return { state: "saving" };
    if (this.failure !== null) return { state: "failed", message: this.failure };
    const [reason] = this.holds.values();
    if (reason !== undefined) return { state: "held", reason };
    return this.savedOnce ? { state: "saved" } : { state: "idle" };
  }

  /** Something is not in the draft yet */
  get unsaved(): boolean {
    return this.waiting > 0 || this.running > 0 || this.failure !== null || this.holds.size > 0;
  }

  /** Save a subject once it was left alone for a moment; a save of it still waiting, or failed, is replaced */
  queue(key: string, run: Save): void {
    this.forgetFailure(key);
    this.holds.delete(key);
    this.pending.delete(key);
    this.pending.set(key, { run, due: Date.now() + this.delay });
    this.waiting = this.pending.size;
    this.arm();
  }

  /** A subject has nothing to save any more (its edit was taken back before it was written) */
  drop(key: string): void {
    this.forgetFailure(key);
    this.holds.delete(key);
    if (this.pending.delete(key)) {
      this.waiting = this.pending.size;
      this.arm();
    }
  }

  /** A subject cannot be saved as it stands, for this reason: nothing of it is written until it is queued again */
  hold(key: string, reason: string): void {
    this.drop(key);
    this.holds.set(key, reason);
  }

  /** Start every waiting save now (the page is being left); resolves once all of them ran */
  flush(): Promise<void> {
    this.start(() => true);
    return this.chain;
  }

  /** Try the failed saves again, now */
  retry(): void {
    clearTimeout(this.retryTimer);
    for (const [key, run] of this.failures) if (!this.pending.has(key)) this.pending.set(key, { run, due: 0 });
    this.failures.clear();
    this.failure = null;
    this.start(job => job.due === 0);
  }

  private forgetFailure(key: string): void {
    if (this.failures.delete(key) && !this.failures.size) this.failure = null;
  }

  private arm(): void {
    clearTimeout(this.timer);
    if (!this.pending.size) return;
    const due = Math.min(...[...this.pending.values()].map(job => job.due));
    this.timer = setTimeout(() => this.start(job => job.due <= Date.now()), Math.max(0, due - Date.now()));
  }

  /** Move the chosen waiting saves into the line, in the order they were queued */
  private start(chosen: (job: { due: number }) => boolean): void {
    for (const [key, job] of [...this.pending]) {
      if (!chosen(job)) continue;
      this.pending.delete(key);
      this.running += 1;
      this.chain = this.chain.then(job.run).then(
        () => {
          this.savedOnce = true;
        },
        (error: unknown) => {
          // A newer save of the subject is on its way: it stands for this one
          if (this.pending.has(key)) return;
          this.failures.set(key, job.run);
          this.failure = errorText(error);
          if (isTransient(error)) {
            clearTimeout(this.retryTimer);
            this.retryTimer = setTimeout(() => this.retry(), this.retryDelay);
          }
        },
      ).finally(() => {
        this.running -= 1;
      });
    }
    this.waiting = this.pending.size;
    this.arm();
  }
}

export const autosave = new Autosave();
// What waits, runs, failed or is held is not in the draft: a reload would lose it
trackUnsaved(() => autosave.unsaved);

/**
 * Leaving the page writes what waits: when the tab is hidden or closed the waiting saves start at once, and while
 * something is still unsaved the browser asks before it closes or reloads the page. Returns the remover.
 */
export const guardUnsavedOnLeave = (saver: Autosave = autosave): (() => void) => {
  const onHide = () => {
    if (document.visibilityState === "hidden") void saver.flush();
  };
  const onLeave = (event: BeforeUnloadEvent) => {
    if (!saver.unsaved) return;
    void saver.flush();
    event.preventDefault();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("beforeunload", onLeave);
  return () => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("beforeunload", onLeave);
  };
};
