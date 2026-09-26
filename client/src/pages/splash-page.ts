import { LoadingState, Step } from "@/types";
import { getTutorial } from "@/utils/game-config";
import { staticSplashStep, whenStaticSplashHidden } from "@/utils";
import { Page } from "./page";
import "@/components/tutorial";

/** Fallback duration of a splash step without `advance` */
const STEP_MS = 2000;

/**
 * The splash = the leading onboarding steps without a button (content: today Mark + title, then title,
 * author and publisher fading in – design p.1–2).
 */
export const getSplashSteps = (steps: readonly Step[] = getTutorial()): Step[] => {
  const sorted = [...steps].sort((a, b) => a.index - b.index);
  const firstWithButton = sorted.findIndex(step => step.button);
  return firstWithButton === -1 ? sorted : sorted.slice(0, firstWithButton);
};

/**
 * Start (`/`) for returning readers (Tilman 2026-09-26, replaces the home page with Start / Tutorial):
 * the splash plays – each step for its `advance` time, a tap skips ahead – then scan mode opens on the
 * last spread. A first visit gets the whole onboarding instead (`/tutorial`, see main.ts); the tutorial
 * itself is in Info → Settings.
 */
export class SplashPage extends Page {
  private steps: Step[] = getSplashSteps();
  private position = 0;
  private timer: number | undefined;
  private waitForLoad: (() => void) | null = null;
  /** Invalidates a pending start (static splash still fading) when the page stops */
  private playToken = 0;

  get styles(): string {
    return /* css */ `
      :host {
        top: 0;
        height: 100%;
        border-radius: 0;
        box-shadow: none;
        transition: opacity .3s ease, visibility .3s;
        background: var(--onboarding-background);
        pointer-events: all;
        cursor: default;
      }
      .content {
        position: absolute;
        inset: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: max(11vh, 5.5rem) 1.5rem 1rem;   /* Mark 88 px from the top, as the onboarding */
        box-sizing: border-box;
      }
      /* As the onboarding: the text block reaches down to 58 % – the footer (publisher) sits there, design p.2 */
      tutorial-content {
        flex: 1 0 auto;
        width: 100%;
        --actions-top: calc(58vh - max(11vh, 5.5rem));
      }
    `;
  }

  get template(): string {
    return /* html */ `<div class="content"><tutorial-content></tutorial-content></div>`;
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name !== "active") return;
    if (newValue === "true") this.play();
    else this.stop();
  }

  setupEventListeners() {
    this.shadowRoot?.addEventListener("click", this.next);
  }

  cleanupEventListeners() {
    this.shadowRoot?.removeEventListener("click", this.next);
    this.stop();
  }

  /**
   * Starts once the app has loaded – at startup the loading screen would hide the first step. The static
   * splash (index.html) already shows the first step: then it continues with the next one, after the
   * static splash is gone (no further step: scan mode opens underneath right away).
   */
  private play() {
    this.stop();
    const shown = staticSplashStep();
    this.position = shown !== undefined && this.steps[0]?.index === shown ? 1 : 0;
    const token = this.playToken;
    const start = () => {
      if (this.position > 0 && this.steps[this.position]) {
        void whenStaticSplashHidden().then(() => token === this.playToken && this.show());
      } else {
        this.show();
      }
    };
    const loading = (state: LoadingState) => state === LoadingState.LOADING || state === LoadingState.INITIAL;
    if (!loading(this.game.state.loading)) {
      start();
      return;
    }
    // Show the first step right away (behind the loading screen), its time starts after loading
    const first = this.steps[this.position];
    if (first) this.shadowRoot?.querySelector("tutorial-content")?.setAttribute("current-step", String(first.index));
    this.waitForLoad = this.game.subscribeToProperty("loading", state => {
      if (loading(state)) return;
      this.waitForLoad?.();
      this.waitForLoad = null;
      start();
    });
  }

  private stop() {
    this.playToken += 1;
    window.clearTimeout(this.timer);
    this.waitForLoad?.();
    this.waitForLoad = null;
  }

  private show() {
    window.clearTimeout(this.timer);
    const step = this.steps[this.position];
    if (!step) {
      this.finish();
      return;
    }
    this.shadowRoot?.querySelector("tutorial-content")?.setAttribute("current-step", String(step.index));
    this.timer = window.setTimeout(this.next, step.advance ?? STEP_MS);
  }

  /** Next splash step, or scan mode after the last one (also on a tap) */
  private next = () => {
    this.position += 1;
    this.show();
  };

  private finish() {
    window.clearTimeout(this.timer);
    this.game.router.navigate("/spread");
  }
}

customElements.define("splash-page", SplashPage);
