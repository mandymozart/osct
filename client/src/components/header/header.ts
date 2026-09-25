import { GameStoreService } from "@/services/GameStoreService";
import { GameMode } from "@/types";
import { IGame } from "@/types/game";
import "./entries-counter";
import "./mark-the-page";

/**
 * Top chrome, per mode (design 260804):
 * - IDLE (home, tutorial): name line, tap → about.
 * - SCAN: Mark the Page + counter (frame 6).
 * - CONSULTATION: Mark (consultation state) + counter + "i" → Info (= about, frames 15, 17, 32).
 */
export class GameHeader extends HTMLElement {
  private game: Readonly<IGame>;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    this.initialize();
    this.unsubscribe = this.game.subscribeToProperty("mode", (mode) => this.updateMode(mode));
    this.updateMode(this.game.state.mode);
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
            <style>
                :host {}

                header {
                    width: 100%;
                    position: fixed;
                    top: 0;
                    right: 0;
                    height: var(--offset-top,4rem);
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    cursor: pointer;
                }

                .header-left {
                    padding-left: 1rem;
                }

                .header-right {
                    padding-right: 1rem;
                }

                .header-dash {
                    flex: 1;
                    background-color: var(--color-primary);
                height: 0.2rem;
                    transform: translateY(.1rem);
                    border-radius: 0.05rem;
                }

                .chrome {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    /* --debug-offset: space for the dev debug overlay line */
                    padding-top: calc(max(.5rem, env(safe-area-inset-top)) + var(--debug-offset, 0px));
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: .25rem;
                    pointer-events: none;
                    z-index: 1;
                }

                .info {
                    position: absolute;
                    top: calc(max(.75rem, env(safe-area-inset-top)) + var(--debug-offset, 0px));
                    right: 1rem;
                    width: 1.75rem;
                    height: 1.75rem;
                    border-radius: 50%;
                    border: 1px solid var(--glass-border);
                    background: rgba(255, 255, 255, .08);
                    color: var(--color-chrome-muted);
                    font-family: var(--font-design);
                    font-size: .8rem;
                    cursor: pointer;
                    pointer-events: all;
                }

                :host([mode="idle"]) .chrome,
                :host(:not([mode="idle"])) header,
                :host(:not([mode="consultation"])) .info {
                    display: none;
                }
            </style>
            <slot></slot>
            <header id="main-header">
              <div class="header-left">Kevin Bray</div>
              <div class="header-dash"></div>
              <div class="header-right">Onion Skin and Crocodile Tears</div>
            </header>
            <div class="chrome">
              <mark-the-page></mark-the-page>
              <entries-counter></entries-counter>
              <button type="button" class="info" id="info" aria-label="Info">i</button>
            </div>
        `;
  }

  private updateMode(mode: GameMode) {
    this.setAttribute("mode", mode);
  }

  private initialize() {
    const header = this.shadowRoot!.querySelector("#main-header");
    if (header) {
      header.addEventListener("click", () => {
        this.game.router.navigate("/about");
      });
    }
    this.shadowRoot!.querySelector("#info")?.addEventListener("click", () => {
      this.game.router.navigate("/about");
    });
  }
}

customElements.define("game-header", GameHeader);
