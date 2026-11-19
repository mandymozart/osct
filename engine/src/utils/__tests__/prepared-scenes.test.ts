import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDeviceStorage } from "../device-storage";
import { cyclePreparedSceneRange, getPreparedSceneRange, getPreparedWindow, getPreparedWindowSetting, getStoredWindowSetting, isGrowingWindow, setTargetBudget, setWindowOverride, subscribePreparedWindow } from "../prepared-scenes";
import { getScenes } from "../../content/game-config";

describe("scenes kept loaded", () => {
  /** The app's storage for the engine's switches */
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map();
    setDeviceStorage({ get: key => stored.get(key) ?? null, set: (key, value) => void (value === null ? stored.delete(key) : stored.set(key, value)) });
  });

  afterEach(() => {
    setDeviceStorage(null);
    setTargetBudget(null);
    setWindowOverride(null);
  });

  it("holds two scenes on either side (±2) by default and cycles through the other windows", () => {
    expect(getPreparedWindowSetting()).toBe(2);
    expect(getPreparedSceneRange()).toBe(2);
    expect(isGrowingWindow()).toBe(false);
    expect([cyclePreparedSceneRange(), cyclePreparedSceneRange(), cyclePreparedSceneRange(), cyclePreparedSceneRange(), cyclePreparedSceneRange()])
      .toEqual([Infinity, "grow", 0, 1, 2]);
    expect(stored.get("ar-prepared-scenes")).toBe("2");
  });

  it("grows towards the whole book when grow is chosen (content for the neighbours)", () => {
    stored.set("ar-prepared-scenes", "grow");
    expect(getPreparedWindowSetting()).toBe("grow");
    expect(getPreparedSceneRange()).toBe(1);
    expect(isGrowingWindow()).toBe(true);
  });

  it("a changed setting applies at once (the scene re-prepares its window)", () => {
    let calls = 0;
    const unsubscribe = subscribePreparedWindow(() => calls++);
    cyclePreparedSceneRange();
    expect(calls).toBe(1);
    unsubscribe();
  });

  it("does not grow while the load test sets a budget", () => {
    setTargetBudget(10);
    expect(isGrowingWindow()).toBe(false);
  });

  it("ignores a stored value it does not know", () => {
    stored.set("ar-prepared-scenes", "7");
    expect(getPreparedWindowSetting()).toBe(2);
  });

  it("a storage that refuses leaves the default (±2)", () => {
    setDeviceStorage({ get: () => { throw new Error("blocked"); }, set: () => { throw new Error("blocked"); } });
    expect(getPreparedWindowSetting()).toBe(2);
    expect(cyclePreparedSceneRange()).toBe(Infinity);
    expect(getStoredWindowSetting()).toBe(2);
  });

  it("the trial's override holds the current scene only, applies at once and leaves the stored setting alone", () => {
    let calls = 0;
    const unsubscribe = subscribePreparedWindow(() => calls++);
    setWindowOverride(0);
    expect(calls).toBe(1);
    expect(getPreparedWindowSetting()).toBe(0);
    expect(isGrowingWindow()).toBe(false);
    expect(getPreparedWindow(getScenes()[5].id)).toEqual([]); // nothing prepared or preloaded next to it
    cyclePreparedSceneRange(); // the overlay's Change: the stored setting, not the override
    expect(getStoredWindowSetting()).toBe(Infinity);
    expect(getPreparedWindowSetting()).toBe(0);
    setWindowOverride(null);
    expect(getPreparedWindowSetting()).toBe(Infinity);
    expect(calls).toBe(3);
    unsubscribe();
  });
});
