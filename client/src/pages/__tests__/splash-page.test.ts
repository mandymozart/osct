import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameStoreService } from "@/services";
import { Pages, Step } from "@/types";
import { getTutorial } from "@/utils/game-config";
import { getSplashSteps } from "../splash-page";

const game = GameStoreService.getInstance();
const step = (index: number, button?: string): Step => ({ index, button } as Step);

describe("splash", () => {
  it("is the onboarding steps before the first one with a button", () => {
    expect(getSplashSteps([step(2, "Continue"), step(0), step(1), step(3)]).map(s => s.index)).toEqual([0, 1]);
    expect(getSplashSteps([step(0), step(1)]).map(s => s.index)).toEqual([0, 1]);
    expect(getSplashSteps(getTutorial()).every(s => !s.button)).toBe(true);
  });

  describe("page", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      document.body.innerHTML = "";
      game.router.navigate("/");
      game.finishLoading();
    });
    afterEach(() => { vi.useRealTimers(); });

    const mount = () => {
      const page = document.body.appendChild(document.createElement("splash-page"));
      page.setAttribute("active", "true");
      return page;
    };
    const shownStep = (page: HTMLElement) => page.shadowRoot!.querySelector("tutorial-content")!.getAttribute("current-step");

    it("plays the splash steps, then opens scan mode", () => {
      const steps = getSplashSteps();
      const page = mount();
      steps.forEach(step => {
        expect(shownStep(page)).toBe(String(step.index));
        expect(game.state.currentRoute?.page).toBe(Pages.SPLASH);
        vi.advanceTimersByTime(step.advance ?? 2000);
      });
      expect(game.state.currentRoute?.page).toBe(Pages.SPREAD);
    });

    it("starts its time only after the app has loaded (the loading screen would hide it)", () => {
      game.startLoading();
      const steps = getSplashSteps();
      const page = mount();
      expect(shownStep(page)).toBe(String(steps[0].index));
      vi.advanceTimersByTime(10_000);
      expect(shownStep(page)).toBe(String(steps[0].index));

      game.finishLoading();
      vi.advanceTimersByTime((steps[0].advance ?? 2000) - 1);
      expect(shownStep(page)).toBe(String(steps[0].index));
      steps.forEach(step => vi.advanceTimersByTime(step.advance ?? 2000));
      expect(game.state.currentRoute?.page).toBe(Pages.SPREAD);
    });

    it("skips ahead on a tap", () => {
      const page = mount();
      getSplashSteps().forEach(() => (page.shadowRoot!.querySelector(".content") as HTMLElement).click());
      expect(game.state.currentRoute?.page).toBe(Pages.SPREAD);
    });
  });
});
