import { describe, expect, it } from "vitest";
import { StageProgress } from "../progress";

describe("the stage's progress (the plugins' book API on the stage)", () => {
  it("unlocks a target once, locks it again for a replay, and knows no consulted entries", () => {
    const progress = new StageProgress();
    const reader = progress.reader();
    expect(progress.unlock("key")).toBe(true);
    expect(progress.unlock("key")).toBe(false);
    expect(reader.unlocked!("key")).toBe(true);
    expect(reader.unlocked!("door")).toBe(false);
    expect(reader.consulted!("key")).toBe(false);
    progress.lock(["key"]);
    expect(reader.unlocked!("key")).toBe(false);
    expect(progress.unlock("key")).toBe(true);
  });

  it("keeps the book variables for the workspace; a reset starts a new game", () => {
    const progress = new StageProgress();
    const { variables } = progress.reader();
    variables!.set("hasKey", true);
    variables!.set("chapter", 2);
    expect(variables!.get("hasKey")).toBe(true);
    expect(variables!.all()).toEqual({ hasKey: true, chapter: 2 });
    variables!.set("chapter", null);
    expect(variables!.all()).toEqual({ hasKey: true });
    progress.unlock("key");
    progress.reset();
    expect(variables!.all()).toEqual({});
    expect(progress.reader().unlocked!("key")).toBe(false);
  });
});
