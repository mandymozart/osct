import { afterEach, describe, expect, it } from "vitest";
import { getSpreads, getTargets } from "../../content/game-config";
import { loadTestSteps } from "../load-test";
import { getPreparedWindow, getTargetBudget, setTargetBudget, spreadsByDistance, subscribePreparedWindow } from "../../utils/prepared-spreads";
import { median } from "../../utils/tracker-debug";

describe("window of spreads kept ready", () => {
  afterEach(() => setTargetBudget(null));
  const spreads = getSpreads();
  const middle = spreads[Math.floor(spreads.length / 2)];
  const index = spreads.indexOf(middle);
  const distance = (id: string) => Math.abs(spreads.findIndex(s => s.id === id) - index);

  it("orders the other spreads nearest first, the next before the previous", () => {
    const ordered = spreadsByDistance(middle.id);
    expect(ordered.length).toBe(spreads.length - 1);
    expect(ordered).not.toContain(middle);
    ordered.forEach((spread, i) => { if (i) expect(distance(spread.id)).toBeGreaterThanOrEqual(distance(ordered[i - 1].id)); });
    expect(ordered[0]).toBe(spreads[index + 1]);
    expect(ordered[1]).toBe(spreads[index - 1]);
  });

  /** The other spreads with targets, nearest first – the window skips the ones without */
  const held = spreadsByDistance(middle.id).filter(s => getTargets(s.id).length > 0);
  const next = spreads.slice(index + 1).find(s => getTargets(s.id).length > 0);
  const previous = spreads.slice(0, index).reverse().find(s => getTargets(s.id).length > 0);

  it("±n: the n nearest spreads with targets on either side, the next before the previous", () => {
    expect(getPreparedWindow(middle.id, 1, null)).toEqual([next, previous].filter(Boolean));
    expect(getPreparedWindow(middle.id, 0, null)).toEqual([]);
    expect(getPreparedWindow(middle.id, Infinity, null)).toHaveLength(held.length);
    expect(getPreparedWindow(middle.id, Infinity, null).every(s => getTargets(s.id).length > 0)).toBe(true);
  });

  it("target budget: the nearest spreads until their targets reach it", () => {
    const window = getPreparedWindow(middle.id, 1, 10);
    const targets = window.reduce((n, s) => n + getTargets(s.id).length, 0);
    expect(targets).toBeGreaterThanOrEqual(10);
    expect(targets - getTargets(window.at(-1)!.id).length).toBeLessThan(10);
    expect(window[0]).toBe(next);
    expect(window.every(s => getTargets(s.id).length > 0)).toBe(true);
    expect(getPreparedWindow(middle.id, 1, 0)).toEqual([]);
  });

  it("the load test's budget replaces the range and notifies the scene", () => {
    let calls = 0;
    const unsubscribe = subscribePreparedWindow(() => calls++);
    setTargetBudget(5);
    setTargetBudget(5);
    expect(getTargetBudget()).toBe(5);
    expect(getPreparedWindow(middle.id)).toEqual(getPreparedWindow(middle.id, 1, 5));
    setTargetBudget(null);
    expect(calls).toBe(2);
    unsubscribe();
  });
});

describe("engine load test", () => {
  it("caps the steps at what the book has and drops repeats", () => {
    expect(loadTestSteps([0, 5, 10, 20, 40, 80, Infinity], 30)).toEqual([0, 5, 10, 20, 30]);
    expect(loadTestSteps([0, 5, Infinity], 3)).toEqual([0, 3]);
  });

  it("median", () => {
    expect(median([])).toBe(0);
    expect(median([300, 100, 200])).toBe(200);
    expect(median([100, 400])).toBe(250);
  });
});
