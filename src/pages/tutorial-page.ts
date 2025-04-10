import { Page } from "./page";
import { assert } from "../utils/assert";
import { tutorial } from "@/game.config.json";
import { TutorialStepData, ITutorialNavigation } from "@/types/tutorial";
import { GameState } from "@/types/game";

import "../components/tutorial/tutorial-content";
import "../components/tutorial/tutorial-navigation";

export class TutorialPage extends Page {
  static get observedAttributes() {
    return ["active", "step"];
  }

  protected get styles(): string {
    return /* css */ `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background-color: var(--color-background, #fff);
        color: var(--color-text, #333);
      }
      
      .content {
        position: relative;
        display: flex;
        flex-direction: column;
        padding: 2rem;
        gap: 2rem;
        height: calc(100vh - 8rem);
        box-sizing: border-box;
        overflow-y: auto;
      }  
    `;
  }

  protected get template(): string {
    return /* html */ `
      <div class="content">
        <tutorial-content></tutorial-content>
        <tutorial-navigation></tutorial-navigation>
        <close-button></close-button>
      </div>
    `;
  }

  private steps: TutorialStepData[] = tutorial;
  private currentStep: string | null = null;
  private content: HTMLElement | null = null;
  private navigation: ITutorialNavigation | null = null;

  constructor() {
    super();
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.game?.subscribe(this.handleStateChange);
    this.setupComponents();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.game?.unsubscribe(this.handleStateChange);
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

  protected setupEventListeners() {
    const closeButton = this.shadowRoot?.querySelector("close-button");
    closeButton?.addEventListener("close", this.handleClose);
  }

  protected cleanupEventListeners() {
    const closeButton = this.shadowRoot?.querySelector("close-button");
    closeButton?.removeEventListener("close", this.handleClose);
  }

  private handleClose() {
    if (this.game) {
      this.game.router.close();
    }
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
