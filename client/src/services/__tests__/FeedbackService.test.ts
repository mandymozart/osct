import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_STORAGE_KEY, FeedbackService } from "../FeedbackService";
import { GameStoreService } from "../GameStoreService";
import { getSpreads } from "@/utils/game-config";

const vibrate = vi.fn(() => true);
const service = () => FeedbackService.getInstance();

beforeEach(() => {
  vibrate.mockClear();
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
  localStorage.removeItem(FEEDBACK_STORAGE_KEY);
  service().setSettings({ sound: true, haptics: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("FeedbackService", () => {
  it("vibrates with the event's pattern", () => {
    service().play("tick");
    service().play("unlock");
    expect(vibrate).toHaveBeenNthCalledWith(1, 8);
    expect(vibrate).toHaveBeenNthCalledWith(2, [22, 70, 22, 70, 45]);
  });

  it("plays 'found' once per target within the cooldown (tracking flickers)", () => {
    vi.useFakeTimers();
    service().play("found", "a");
    service().play("found", "a");
    service().play("found", "b");
    expect(vibrate).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(4000);
    service().play("found", "a");
    expect(vibrate).toHaveBeenCalledTimes(3);
  });

  it("keeps the settings on this device and respects them", () => {
    service().setSettings({ haptics: false });
    expect(JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY)!)).toEqual({ sound: true, haptics: false });
    service().play("tap");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("taps on buttons and links – also inside shadow roots – but not on silenced elements", () => {
    service().start();
    const host = document.body.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<button id="b"><span>Go</span></button><button id="quiet" data-feedback="none">x</button><p id="text">t</p>`;

    root.querySelector<HTMLElement>("#b span")!.click();
    expect(vibrate).toHaveBeenCalledWith(10);
    vibrate.mockClear();
    root.querySelector<HTMLElement>("#quiet")!.click();
    root.querySelector<HTMLElement>("#text")!.click();
    expect(vibrate).not.toHaveBeenCalled();
    host.remove();
  });

  it("finding a target: the unlock the first time, 'found' afterwards", () => {
    const game = GameStoreService.getInstance();
    game.history.reset();
    const target = getSpreads().flatMap(spread => spread.targets)[0];
    const play = vi.spyOn(service(), "play");

    game.targets.addTarget(target.id);
    game.targets.removeTarget(target.id);
    game.targets.addTarget(target.id);
    expect(play.mock.calls).toEqual([["unlock", target.id], ["found", target.id]]);
    game.targets.removeTarget(target.id);
    play.mockRestore();
  });
});
