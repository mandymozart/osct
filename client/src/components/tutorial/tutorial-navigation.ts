import { GameStoreService } from "@/services";
import { getTutorial } from "@/utils/game-config";
import { IGame, ITutorialNavigation, Step } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";

const tutorial = getTutorial();

/**
 * Onboarding step button (design p.3–5): black pill with a white glow. The step's `action` decides
 * what it does: `next` (default) → next step, `camera` → ask for camera access, then the next step,
 * `scan` → scan mode. Steps without a button show nothing here (the page advances them).
 */
export class TutorialNavigation extends HTMLElement implements ITutorialNavigation {
  private currentStep = 0;
  private game: Readonly<IGame>;
  private busy = false;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
    this.handleClick = this.handleClick.bind(this);
  }

  static get observedAttributes() {
    return ["current-step"];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name !== "current-step" || oldValue === newValue) return;
    this.currentStep = parseInt(newValue) || 0;
    this.render();
  }

  connectedCallback() {
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.render();
  }

  disconnectedCallback() {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
  }

  private get step(): Step | undefined {
    return tutorial.find(s => s.index === this.currentStep);
  }

  private render() {
    if (!this.shadowRoot) return;
    const label = this.step?.button;
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host { display: flex; justify-content: center; }
      </style>
      ${label ? goldButton({ label, shape: "button", primary: true, className: "next-button" }) : ""}
    `;
  }

  private async handleClick(event: Event) {
    const button = (event.target as HTMLElement).closest("button");
    if (!button || this.busy) return;
    const action = this.step?.action ?? "next";

    if (action === "scan") {
      goToScan(this.game);
      return;
    }
    if (action === "camera") {
      this.busy = true;
      button.disabled = true;
      // Denied: the camera-permission-page overlay explains how to allow it; the step stays
      const granted = await this.game.camera.requestAccess();
      this.busy = false;
      button.disabled = false;
      if (!granted) return;
    }
    goToStep(this.game, this.currentStep + 1);
  }
}

/** Next onboarding step, or scan mode after the last one */
export const goToStep = (game: Readonly<IGame>, index: number) => {
  if (index >= tutorial.length) goToScan(game);
  else game.router.navigate("/tutorial", { key: "step", value: index.toString() });
};

/**
 * Onboarding ends in scan mode ("Access scan", design p.5; also "Skip"); the route sets the mode.
 * Either way the reader counts as onboarded – the next visit starts at home.
 */
export const goToScan = (game: Readonly<IGame>) => {
  game.history.setOnboarded();
  game.router.navigate("/spread");
};

customElements.define("tutorial-navigation", TutorialNavigation);
