import { Page } from "./page";
import { assert } from "../utils/assert";
import { tutorial } from "@/game.config.json";
import { TutorialStepData, ITutorialNavigation } from "@/types/tutorial";
import { GameState, IGame } from "@/types/game";

import "../components/tutorial/tutorial-content";
import "../components/tutorial/tutorial-navigation";
import { GameStoreService } from "@/services/GameStoreService";

export class TutorialPage extends Page {
  static get observedAttributes() {
    return ["active", "step"];
  }

   get styles(): string {
    return /* css */ `
      :host {
        display: flex;
        flex-direction: column;
        bottom: 0;
        overflow: hidden;
        background-color: var(--color-background, #fff);
        color: var(--color-text, #333);
        pointer-events: all;
      }
      
      .content {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: var(--offset-top, 4rem);
        display: flex;
        flex-direction: column;
        margin: 0 1rem;
        gap: 2rem;
        box-sizing: border-box;
        overflow-y: auto;
      }  
    `;
  }

   get template(): string {
    return /* html */ `
      <div class="content">
        <tutorial-content></tutorial-content>
        <tutorial-navigation></tutorial-navigation>
      </div>
      <close-button></close-button>
    `;
  }

  private steps: TutorialStepData[] = tutorial;
  private currentStep: string | null = null;
  private content: HTMLElement | null = null;
  private navigation: ITutorialNavigation | null = null;
  protected readonly game: Readonly<IGame>;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.game?.subscribe(this.handleStateChange.bind(this));
    this.setupComponents();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.game?.unsubscribe(this.handleStateChange.bind(this));
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "active" && newValue !== oldValue) {
      if (newValue === "true") {
        this.updateView();
      }
    }

    if (name === "step" && newValue !== oldValue) {
      this.currentStep = newValue;
      this.updateView();
    }
  }

  protected handleStateChange(_: GameState) {
    this.updateView();
  }

   setupEventListeners() {
    const closeButton = this.shadowRoot?.querySelector("close-button");
    closeButton?.addEventListener("close", this.handleClose.bind(this));
  }

   cleanupEventListeners() {
    const closeButton = this.shadowRoot?.querySelector("close-button");
    closeButton?.removeEventListener("close", this.handleClose.bind(this));
  }

  private handleClose() {
    this.game.router.close();
  }

  private setupComponents() {
    assert(this.shadowRoot, "Shadow root not available in setupComponents");

    this.content = this.shadowRoot.querySelector("tutorial-content");
    this.navigation = this.shadowRoot.querySelector("tutorial-navigation");

    if (this.content && this.navigation) {
      // Pass initial step information
      const step = Number(this.getAttribute("step") || this.currentStep || "0");
      this.navigation.setAttribute("current-step", step.toString());
      const stepData = this.steps.find((s) => s.index === step);
      if (stepData) {
        // Set up content
        this.content.setAttribute("title", stepData.title);
        this.content.setAttribute("description", stepData.description);
        if (stepData.illustration) {
          this.content.setAttribute("illustration", stepData.illustration);
        }
      }
    }
    this.updateView();
  }

  private updateView() {
    assert(this.shadowRoot, "Shadow root not available in updateView");
    if (!this.content || !this.navigation) return;
    assert(this.content, "Content element not available in updateView");
    assert(this.navigation, "Navigation element not available in updateView");
    const step = Number(this.getAttribute("step") || this.currentStep || "0");
    const stepData = this.steps[step];

    if (!stepData) {
      console.warn(`Tutorial step not found: ${step}`);
      return;
    }
    this.content.setAttribute("title", stepData.title);
    this.content.setAttribute("description", stepData.description);
    if (stepData.illustration) {
      this.content.setAttribute("illustration", stepData.illustration ?? null);
    }

    this.navigation.setAttribute("current-step", step.toString());
  }
}

customElements.define("tutorial-page", TutorialPage);
