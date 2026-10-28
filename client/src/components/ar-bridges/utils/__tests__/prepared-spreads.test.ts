import { afterEach, describe, expect, it } from "vitest";
import { cyclePreparedSpreadRange, getPreparedSpreadRange, getPreparedWindow, getPreparedWindowSetting, getStoredWindowSetting, isGrowingWindow, setTargetBudget, setWindowOverride, subscribePreparedWindow } from "../prepared-spreads";
import { getSpreads } from "@/utils/game-config";

describe("spreads kept loaded", () => {
  afterEach(() => {
    localStorage.removeItem("osct-ar-prepared-spreads");
    setTargetBudget(null);
    setWindowOverride(null);
  });

  it("holds the neighbours (±1) by default and cycles through the other windows", () => {
    expect(getPreparedWindowSetting()).toBe(1);
    expect(getPreparedSpreadRange()).toBe(1);
    expect(isGrowingWindow()).toBe(false);
    expect([cyclePreparedSpreadRange(), cyclePreparedSpreadRange(), cyclePreparedSpreadRange(), cyclePreparedSpreadRange(), cyclePreparedSpreadRange()])
      .toEqual([2, Infinity, "grow", 0, 1]);
    expect(localStorage.getItem("osct-ar-prepared-spreads")).toBe("1");
  });

  it("grows towards the whole book when grow is chosen (content for the neighbours)", () => {
    localStorage.setItem("osct-ar-prepared-spreads", "grow");
    expect(getPreparedWindowSetting()).toBe("grow");
    expect(getPreparedSpreadRange()).toBe(1);
    expect(isGrowingWindow()).toBe(true);
  });

  it("a changed setting applies at once (the scene re-prepares its window)", () => {
    let calls = 0;
    const unsubscribe = subscribePreparedWindow(() => calls++);
    cyclePreparedSpreadRange();
    expect(calls).toBe(1);
    unsubscribe();
  });

  it("does not grow while the load test sets a budget", () => {
    setTargetBudget(10);
    expect(isGrowingWindow()).toBe(false);
  });

  it("ignores a stored value it does not know", () => {
    localStorage.setItem("osct-ar-prepared-spreads", "7");
    expect(getPreparedWindowSetting()).toBe(1);
  });

  it("the trial's override holds the current spread only, applies at once and leaves the stored setting alone", () => {
    let calls = 0;
    const unsubscribe = subscribePreparedWindow(() => calls++);
    setWindowOverride(0);
    expect(calls).toBe(1);
    expect(getPreparedWindowSetting()).toBe(0);
    expect(isGrowingWindow()).toBe(false);
    expect(getPreparedWindow(getSpreads()[5].id)).toEqual([]); // nothing prepared or preloaded next to it
    cyclePreparedSpreadRange(); // the overlay's Change: the stored setting, not the override
    expect(getStoredWindowSetting()).toBe(2);
    expect(getPreparedWindowSetting()).toBe(0);
    setWindowOverride(null);
    expect(getPreparedWindowSetting()).toBe(2);
    expect(calls).toBe(3);
    unsubscribe();
  });
});
