import { tutorial } from "@/game.config.json";
import { ITutorialContent } from "@/types/tutorial";

/**
 * Component for displaying tutorial step content including
 * title, description and illustration
 */
export class TutorialContent extends HTMLElement implements ITutorialContent {
  private _title: string = "";
  private _description: string = "";
  private _illustration: string = "";
  private _currentStep: number = 0;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["title", "description", "illustration", "current-step"];
  }

  /**
   * Get title
   */
  get title(): string {
    return this._title;
  }

  /**
   * Set title
   */
  set title(value: string) {
    if (this._title !== value) {
      this._title = value;
      this.setAttribute("title", value);
      this.updateView();
    }
  }

  /**
   * Get description
   */
  get description(): string {
    return this._description;
  }

  /**
   * Set description
   */
  set description(value: string) {
    if (this._description !== value) {
      this._description = value;
      this.setAttribute("description", value);
      this.updateView();
    }
  }

  /**
   * Get illustration
   */
  get illustration(): string {
    return this._illustration;
  }

  /**
   * Set illustration
   */
  set illustration(value: string) {
    if (this._illustration !== value) {
      this._illustration = value;
      this.setAttribute("illustration", value);
      this.updateView();
    }
  }

  /**
   * Get current step
   */
  get currentStep(): number {
    return this._currentStep;
  }

  /**
   * Set current step
   */
  set currentStep(value: number) {
    if (this._currentStep !== value) {
      this._currentStep = value;
      this.setAttribute("current-step", value.toString());
      this.updateView();
    }
  }

  /**
   * Handle attribute changes
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;

    switch (name) {
      case "title":
        this._title = newValue;
        break;

      case "description":
        this._description = newValue;
        break;

      case "illustration":
        this._illustration = newValue;
        break;

      case "current-step":
        this._currentStep = parseInt(newValue) || 0;
        break;
    }

    if (this.shadowRoot) {
      this.updateView();
    }
  }

  /**
   * Connected callback - Initialize the component
   */
  connectedCallback() {
    this.render();
    this.updateView();
  }

  /**
   * Render the component structure
   */
  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = /* html */ `
        <style>
          :host {
            display: block;
            text-align: left;
          }
          
          .step-header {
           height: 6rem;
            font-size: 1.25rem;
            color: var(--primary-500);
            display: flex;
            align-items: center;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
          .content-container {
            position: absolute;
            top: 6rem;
            display: grid;
            grid-template-rows: 8rem auto;
            bottom: 9rem;
            width: 100%;
            overflow-y: auto;
            gap: 1rem;
          }
          .illustration {
            display: flex;
            align-items: center;
            justify-content: center;
            }
            .illustration img {
              height: 4rem;
            }
          
          .title {
            font-size: 1.5rem;
            font-weight: 400;
            margin: 0 0 1rem 0;
          }
          
          .description {
            font-size: 1.25rem;
            line-height: 1.5;
            margin: 0;
          }
        </style>
        
        <div class="step-header">Step ${this._currentStep + 1} of ${
          tutorial.length - 1
        }</div>
        <div class="content-container">
          <div class="illustration">
            <img alt="${this._title}" src="${this._illustration}" />
          </div>
          <div class="text">
            <h2 class="title">${this._title}</h2>
            <p class="description">${this._description}</p>
          </div>
        </div>
      `;
  }

  /**
   * Update the view with current data
   */
  private updateView() {
    if (!this.shadowRoot) return;
    this.render();
  }
}

customElements.define("tutorial-content", TutorialContent);
