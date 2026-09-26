import { Step } from "@/types";
import { getTutorial } from "@/utils/game-config";
import { Page } from "./page";
import { goToScan, goToStep } from "@/components/tutorial";
import { tHtml } from "@/i18n";

/**
 * Onboarding = tutorial (design p.1–5, PLAN Phase 5): black screen, Mark, one step at a time (route
 * param `step`). Steps without a button (splash, title) advance after `advance` ms or on a tap; the
 * others advance with their button (`tutorial-navigation`). "Skip" goes straight to scan mode
 * (returning readers open the tutorial from Info).
 */
export class TutorialPage extends Page {
  static get observedAttributes() {
    return ["active", "step"];
  }

  private steps: Step[] = getTutorial();
  private stepIndex = 0;
  private advanceTimer: number | undefined;

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
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: max(11vh, 5.5rem) 1.5rem 1rem;   /* Mark 88 px from the top (DESIGN.md §3) */
        box-sizing: border-box;
      }
      tutorial-content { flex: 1; width: 100%; }
      tutorial-navigation {
        position: absolute;
        left: 0;
        right: 0;
        top: 58%;
      }
      .skip {
        position: absolute;
        top: calc(max(1rem, env(safe-area-inset-top)) + var(--debug-offset, 0rem));
        right: 1rem;
        border: none;
        background: none;
        color: var(--color-muted);
        font-family: var(--font-design);
        letter-spacing: var(--tracking-design);
        font-size: var(--text-size-small);
        cursor: pointer;
      }
    `;
  }

  get template(): string {
    return /* html */ `
      <div class="content">
        <tutorial-content></tutorial-content>
      </div>
      <tutorial-navigation></tutorial-navigation>
      <button type="button" class="skip">${tHtml("tutorial.skip")}</button>
    `;
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "step" && newValue !== oldValue && newValue !== null) {
      this.stepIndex = Number(newValue) || 0;
      this.showStep();
    }
    if (name === "active") {
      if (newValue === "true") this.showStep();
      else window.clearTimeout(this.advanceTimer);
    }
  }

  setupEventListeners() {
    this.shadowRoot?.addEventListener("click", this.handleClick);
  }

  cleanupEventListeners() {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    window.clearTimeout(this.advanceTimer);
  }

  private get step(): Step | undefined {
    return this.steps.find(s => s.index === this.stepIndex);
  }

  private showStep() {
    window.clearTimeout(this.advanceTimer);
    this.shadowRoot?.querySelector("tutorial-content")?.setAttribute("current-step", String(this.stepIndex));
    this.shadowRoot?.querySelector("tutorial-navigation")?.setAttribute("current-step", String(this.stepIndex));

    const step = this.step;
    if (this._active && step && !step.button && step.advance) {
      this.advanceTimer = window.setTimeout(() => this.next(), step.advance);
    }
  }

  private next() {
    window.clearTimeout(this.advanceTimer);
    goToStep(this.game, this.stepIndex + 1);
  }

  private handleClick = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.closest(".skip")) {
      window.clearTimeout(this.advanceTimer);
      goToScan(this.game);
      return;
    }
    // Steps without a button: a tap anywhere continues
    if (!this.step?.button && !target.closest("tutorial-navigation")) this.next();
  };
}

customElements.define("tutorial-page", TutorialPage);
