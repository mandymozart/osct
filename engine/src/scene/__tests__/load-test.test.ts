import { afterEach, describe, expect, it } from "vitest";
import { getScenes, getTargets } from "../../content/game-config";
import { loadTestSteps } from "../load-test";
import { getPreparedWindow, getTargetBudget, setTargetBudget, scenesByDistance, subscribePreparedWindow } from "../../utils/prepared-scenes";
import { median } from "../../utils/tracker-debug";

describe("window of scenes kept ready", () => {
  afterEach(() => setTargetBudget(null));
  const scenes = getScenes();
  const middle = scenes[Math.floor(scenes.length / 2)];
  const index = scenes.indexOf(middle);
  const distance = (id: string) => Math.abs(scenes.findIndex(s => s.id === id) - index);

  it("orders the other scenes nearest first, the next before the previous", () => {
    const ordered = scenesByDistance(middle.id);
    expect(ordered.length).toBe(scenes.length - 1);
    expect(ordered).not.toContain(middle);
    ordered.forEach((scene, i) => { if (i) expect(distance(scene.id)).toBeGreaterThanOrEqual(distance(ordered[i - 1].id)); });
    expect(ordered[0]).toBe(scenes[index + 1]);
    expect(ordered[1]).toBe(scenes[index - 1]);
  });

  /** The other scenes with targets, nearest first – the window skips the ones without */
  const held = scenesByDistance(middle.id).filter(s => getTargets(s.id).length > 0);
  const next = scenes.slice(index + 1).find(s => getTargets(s.id).length > 0);
  const previous = scenes.slice(0, index).reverse().find(s => getTargets(s.id).length > 0);

  it("±n: the n nearest scenes with targets on either side, the next before the previous", () => {
    expect(getPreparedWindow(middle.id, 1, null)).toEqual([next, previous].filter(Boolean));
    expect(getPreparedWindow(middle.id, 0, null)).toEqual([]);
    expect(getPreparedWindow(middle.id, Infinity, null)).toHaveLength(held.length);
    expect(getPreparedWindow(middle.id, Infinity, null).every(s => getTargets(s.id).length > 0)).toBe(true);
  });

  it("target budget: the nearest scenes until their targets reach it", () => {
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
  it("caps the steps at what the experience has and drops repeats", () => {
    expect(loadTestSteps([0, 5, 10, 20, 40, 80, Infinity], 30)).toEqual([0, 5, 10, 20, 30]);
    expect(loadTestSteps([0, 5, Infinity], 3)).toEqual([0, 3]);
  });

  it("median", () => {
    expect(median([])).toBe(0);
    expect(median([300, 100, 200])).toBe(200);
    expect(median([100, 400])).toBe(250);
  });
});
