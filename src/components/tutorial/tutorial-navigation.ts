import { GameStoreService } from "../../services/GameStoreService";
import { tutorial } from "@/game.config.json";
import { IGame } from "@/types/game";
import { ITutorialNavigation } from "@/types/tutorial";

/**
 * A navigation component for the tutorial with step indicators and navigation buttons
 */
export class TutorialNavigation
  extends HTMLElement
  implements ITutorialNavigation
{
  private currentStep: number = 1;
  private game: Readonly<IGame>;
  private button: HTMLButtonElement | null = null;
  private indicators: HTMLElement | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["current-step"];
  }

  /**
   * Handle attribute changes
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;

    if (name === "current-step") {
      this.currentStep = parseInt(newValue) || 1;
      this.updateView();
    }
  }

  /**
   * Connected callback - Initialize the component
   */
  connectedCallback() {
    this.render();
    this.setupEventListeners();
    this.updateView();
  }

  /**
   * Disconnected callback - Clean up event listeners
   */
  disconnectedCallback() {
    this.cleanupEventListeners();
  }

  /**
   * Render the component structure and set up references
   */
  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          justify-content: space-between;
          width: 100%;
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 1rem 0;
          box-sizing: border-box;
          flex-direction: column-reverse;
          gap:1rem;
        }
        
        .step-indicators {
          display: flex;
          gap: 0.5rem;
          justify-content: center;
        }
        
        .step-indicator {
          width: 1rem;
          height: 1rem;
          border-radius: 50%;
          background-color: var(--background-color, #fff);
          border: 1px solid var(--color-primary, #333);
          transition: all 0.2s ease;
        }
        
        .step-indicator.active {
          border-color: var(--color-secondary, #0066cc);
        }
        
        .nav-buttons {
          display: flex;
          justify-content: flex-end;
        }
        
        button {
          width: 100%;
        }
      </style>
      
      <div class="step-indicators"></div>
      
      <div class="nav-buttons">
        <button is="text-button" variant="secondary" class="next-button">Continue</button>
      </div>
    `;

    this.button = this.shadowRoot.querySelector(".next-button");
    this.indicators = this.shadowRoot.querySelector(".step-indicators");
  }

  /**
   * Update all view elements based on current state
   */
  private updateView() {
    if (!this.shadowRoot) return;

    // Update step indicators
    this.updateStepIndicators();

    // Update button text
    if (this.button) {
      const isLastStep = this.currentStep >= tutorial.length - 1;
      this.button.textContent = isLastStep ? "Finish" : "Continue";
    }
  }

  /**
   * Update the step indicators based on current step
   */
  private updateStepIndicators() {
    if (!this.indicators) return;

    // Clear existing indicators
    this.indicators.innerHTML = "";

    // Create new indicators based on tutorial steps length
    const totalSteps = tutorial.length - 1;
    for (let i = 0; i < totalSteps; i++) {
      const indicator = document.createElement("div");
      indicator.classList.add("step-indicator");
      if (i + 1 === this.currentStep) {
        indicator.classList.add("active");
      }
      this.indicators.appendChild(indicator);
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners() {
    if (this.button) {
      this.button.addEventListener("click", this.handleNext.bind(this));
    }
  }

  /**
   * Clean up event listeners
   */
  private cleanupEventListeners() {
    if (this.button) {
      this.button.removeEventListener("click", this.handleNext.bind(this));
    }
  }

  /**
   * Handle next button click
   */
  private handleNext() {
    const isLastStep = this.currentStep >= tutorial.length - 1;
    if (isLastStep) {
      this.game.router.navigate("/chapters");
    } else {
      const nextStep = this.currentStep + 1;
      this.game.router.navigate("/tutorial", {
        key: "step",
        value: nextStep.toString(),
      });
    }
  }
}

customElements.define("tutorial-navigation", TutorialNavigation);
