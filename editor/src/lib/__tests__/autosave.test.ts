import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { Autosave } from "../autosave.svelte";
import { baselineOf, clearBaselines, differsFromBaseline, noteBaseline } from "../baselines";

const DELAY = 800;
const RETRY = 8000;

/** A save that records its name when it runs and settles when the test says so */
const deferred = (log: string[], name: string) => {
  let settle: { resolve: () => void; reject: (error: unknown) => void } | null = null;
  const run = () => new Promise<void>((resolve, reject) => {
    log.push(name);
    settle = { resolve, reject };
  });
  return { run, resolve: () => settle?.resolve(), reject: (error: unknown) => settle?.reject(error) };
};

describe("the editor's autosave (#259)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves a subject once it was left alone, and only its newest edit", async () => {
    const saver = new Autosave(DELAY, RETRY);
    const log: string[] = [];
    expect(saver.status).toEqual({ state: "idle" });
    saver.queue("tree:a", async () => void log.push("first"));
    await vi.advanceTimersByTimeAsync(DELAY - 100);
    // Another edit before the moment passed: the wait starts again, the older save never runs
    saver.queue("tree:a", async () => void log.push("second"));
    expect(saver.status).toEqual({ state: "saving" });
    expect(saver.unsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(DELAY - 100);
    expect(log).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(["second"]);
    expect(saver.status).toEqual({ state: "saved" });
    expect(saver.unsaved).toBe(false);
  });

  it("gives each subject its own moment: editing one does not keep another waiting", async () => {
    const saver = new Autosave(DELAY, RETRY);
    const log: string[] = [];
    saver.queue("tree:a", async () => void log.push("a"));
    await vi.advanceTimersByTimeAsync(DELAY / 2);
    saver.queue("passes", async () => void log.push("passes"));
    await vi.advanceTimersByTimeAsync(DELAY / 2);
    expect(log).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(DELAY / 2);
    expect(log).toEqual(["a", "passes"]);
  });

  it("runs one save after another, in the order they became due", async () => {
    const saver = new Autosave(DELAY, RETRY);
    const log: string[] = [];
    const first = deferred(log, "first");
    const second = deferred(log, "second");
    saver.queue("tree:a", first.run);
    saver.queue("tree:b", second.run);
    await vi.advanceTimersByTimeAsync(DELAY);
    // The second waits for the first to end
    expect(log).toEqual(["first"]);
    expect(saver.status).toEqual({ state: "saving" });
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(["first", "second"]);
    second.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.status).toEqual({ state: "saved" });
  });

  it("flush starts what waits at once and resolves when it ran", async () => {
    const saver = new Autosave(DELAY, RETRY);
    const log: string[] = [];
    saver.queue("entry:x", async () => void log.push("entry"));
    await saver.flush();
    expect(log).toEqual(["entry"]);
    expect(saver.unsaved).toBe(false);
  });

  it("drops a save whose edit was taken back", async () => {
    const saver = new Autosave(DELAY, RETRY);
    const log: string[] = [];
    saver.queue("tree:a", async () => void log.push("a"));
    saver.drop("tree:a");
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(log).toEqual([]);
    expect(saver.status).toEqual({ state: "idle" });
  });

  it("holds a subject that cannot be saved as it stands, until it is queued again", async () => {
    const saver = new Autosave(DELAY, RETRY);
    const log: string[] = [];
    saver.queue("tree:a", async () => void log.push("incomplete"));
    saver.hold("tree:a", "a rule has no event yet");
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(log).toEqual([]);
    expect(saver.status).toEqual({ state: "held", reason: "a rule has no event yet" });
    expect(saver.unsaved).toBe(true);
    saver.queue("tree:a", async () => void log.push("complete"));
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(log).toEqual(["complete"]);
    expect(saver.status).toEqual({ state: "saved" });
  });

  it("keeps a refused save as failed until its subject is edited again – no retry by itself", async () => {
    const saver = new Autosave(DELAY, RETRY);
    let tries = 0;
    saver.queue("tree:a", async () => {
      tries += 1;
      throw new ApiError(400, "invalid", "The node has no file");
    });
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(saver.status).toEqual({ state: "failed", message: "The node has no file" });
    expect(saver.unsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(RETRY * 3);
    expect(tries).toBe(1);
    // The next edit of the subject replaces the failed save
    saver.queue("tree:a", async () => {});
    expect(saver.status).toEqual({ state: "saving" });
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(saver.status).toEqual({ state: "saved" });
  });

  it("tries a save the network failed again by itself, and Retry does it at once", async () => {
    const saver = new Autosave(DELAY, RETRY);
    let tries = 0;
    const run = async () => {
      tries += 1;
      if (tries < 3) throw new TypeError("Failed to fetch");
    };
    saver.queue("passes", run);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(tries).toBe(1);
    expect(saver.status.state).toBe("failed");
    await vi.advanceTimersByTimeAsync(RETRY);
    expect(tries).toBe(2);
    expect(saver.status.state).toBe("failed");
    saver.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(tries).toBe(3);
    expect(saver.status).toEqual({ state: "saved" });
  });

  it("a newer save of a subject stands for the one that fails meanwhile", async () => {
    const saver = new Autosave(DELAY, RETRY);
    const log: string[] = [];
    const first = deferred(log, "first");
    saver.queue("tree:a", first.run);
    await vi.advanceTimersByTimeAsync(DELAY);
    saver.queue("tree:a", async () => void log.push("second"));
    first.reject(new ApiError(500, "error", "The server failed"));
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(log).toEqual(["first", "second"]);
    expect(saver.status).toEqual({ state: "saved" });
  });
});

describe("what Undo edits goes back to (#259)", () => {
  beforeEach(clearBaselines);

  it("remembers a subject as the draft had it before its first edit, and nothing later", () => {
    expect(baselineOf("tree:a")).toBeUndefined();
    expect(differsFromBaseline("tree:a", { type: "group" })).toBe(false);
    const first = { type: "model", scale: 1 };
    noteBaseline("tree:a", first);
    first.scale = 2;
    noteBaseline("tree:a", { type: "model", scale: 3 });
    expect(baselineOf("tree:a")).toEqual({ type: "model", scale: 1 });
    expect(differsFromBaseline("tree:a", { type: "model", scale: 1 })).toBe(false);
    expect(differsFromBaseline("tree:a", { type: "model", scale: 2 })).toBe(true);
  });

  it("keeps that a subject had nothing (a target without AR content)", () => {
    noteBaseline("tree:b", undefined);
    expect(baselineOf("tree:b")).toBeNull();
    expect(differsFromBaseline("tree:b", null)).toBe(false);
    expect(differsFromBaseline("tree:b", { type: "group" })).toBe(true);
  });
});
