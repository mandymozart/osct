import { GameStoreService } from "@/services/GameStoreService";
import { IGame } from "@/types";

export interface IBaseNavigationButton {
  readonly active?: boolean;
}

/**
 * Base class for navigation buttons
 * Provides common functionality and styling for navigation buttons
 */
export abstract class BaseNavigationButton extends HTMLElement implements IBaseNavigationButton {
  protected button: HTMLButtonElement | null = null;
  protected unsubscribe: (() => void) | null = null;
  protected game: Readonly<IGame>;
  protected _active = false;

  // Bound methods
  private boundHandleClick: (e: Event) => void;
  private boundHandleStateChange: () => void;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    // Bind methods once in constructor and store references
    this.boundHandleClick = this._handleClick.bind(this);
    this.boundHandleStateChange = this.handleStateChange.bind(this);
  }

  connectedCallback() {
    this.render();
    this.updateButtonState();
  }

  disconnectedCallback() {
    this.cleanupListeners();
  }

  /**
   * Render button template - Template method
   * This implementation should not be overridden by subclasses
   */
  protected render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = /* html */ `
            <style>
                :host {
                    display: inline-block;
                    width: 100%;
                }
                
                button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                }
                
                ::slotted(*) {
                    width: 1.2em;
                    height: 1.2em;
                    margin-right: 0.5em;
                }
                
                @media (max-width: 600px) {
                    button[is="text-button"] {
                        padding: 0 0.5em;
                    }
                    
                    .button-text {
                        display: none;
                    }
                }

                ${this.getAdditionalStyles()}
            </style>
            <button is="text-button" ${this._active ? `inverted=""` : ""} size="sm">
                ${this.getButtonIconHTML()}
                <span class="button-text">${this.getButtonText()}</span>
            </button>
        `;

    this.button = this.shadowRoot.querySelector("button");

    // Sync active and disabled states with the button element
    if (this.button) {
      if (this._active) {
        this.button.classList.add("active");
        this.button.setAttribute("active", "");
      } else {
        this.button.classList.remove("active");
        this.button.removeAttribute("active");
      }
    }

    // Setup event listeners after the button is created
    this.setupListeners();
  }

  /**
   * Get additional styles for the button
   * Can be overridden by subclasses to add specific styles
   */
  protected getAdditionalStyles(): string {
    return "";
  }

  /**
   * Get HTML for button icon
   * Should be implemented by subclasses
   */
  protected abstract getButtonIconHTML(): string;

  /**
   * Get button text
   * Can be overridden by subclasses if needed
   */
  protected getButtonText(): string {
    return this.getAttribute("text") || this.textContent?.trim() || "";
  }

  /**
   * Set up event listeners
   */
  protected setupListeners() {
    if (this.button) {
      this.button.addEventListener("click", this.boundHandleClick);
    }

    if (this.game) {
      this.unsubscribe = this.game.subscribe(this.boundHandleStateChange);
    }
  }

  /**
   * Clean up event listeners
   */
  protected cleanupListeners() {
    if (this.button) {
      this.button.removeEventListener("click", this.boundHandleClick);
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Handle game state changes
   */
  protected handleStateChange() {
    this.updateButtonState();
  }

  /**
   * Update button state based on game state
   * Should be implemented by subclasses
   */
  protected abstract updateButtonState(): void;

  /**
   * Handle button click event
   * This handles the DOM event and calls the abstract handleClick method
   * @param event
   */
  private _handleClick(event: Event) {

    this.handleClick();

    // Force an update of all navigation buttons
    // This ensures active states are properly updated after navigation
    // TODO: I don't like the timeout
    if (this.game) {
      // Give the navigation a moment to complete
      setTimeout(() => {
        this.updateButtonState();
        // Manually dispatch an event to signal state change
        window.dispatchEvent(new CustomEvent("navigation-complete"));
      }, 50);
    }
  }

  /**
   * Handle button click
   * Should be implemented by subclasses
   */
  protected abstract handleClick(): void;

  /**
   * Called when an observed attribute changes
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "active") {
      this._active = this.hasAttribute("active");
      if (this.button) {
        if (this._active) {
          this.button.classList.add("active");
          this.button.setAttribute("active", "");
        } else {
          this.button.classList.remove("active");
          this.button.removeAttribute("active");
        }
      }
    }
  }

  /**
   * Set button active state
   */
  set active(value: boolean) {
    if (value !== this._active) {
      this._active = value;
      if (value) {
        this.setAttribute("active", "");
      } else {
        this.removeAttribute("active");
      }
    }
  }

  /**
   * Get button active state
   */
  get active(): boolean {
    return this._active;
  }

  static get observedAttributes(): string[] {
    return ["active"];
  }
}
