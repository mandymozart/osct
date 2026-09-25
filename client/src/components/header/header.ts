import { GameStoreService } from "@/services/GameStoreService";
import { IGame } from "@/types/game";
import "./entries-counter";
import "./mark-the-page";

/**
 * Top chrome, per mode (design 260804):
 * - IDLE (home, tutorial): nothing (the former name line "Kevin Bray — Onion Skin and Crocodile Tears"
 *   was removed on 2026-09-25 – previous design iteration).
 * - SCAN: Mark the Page + counter (frame 6).
 * - CONSULTATION: Mark + "i" → Info (= about, frames 15, 17, 32); the counter
 *   with "Entries consulted" only on the entries list (frame 17); "Entries" → back to the list with
 *   the last category on the entry view and Info (frames 15, 21, 33).
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
    const cleanups = [
      this.game.subscribeToProperty("mode", () => this.updateState()),
      this.game.subscribeToProperty("currentRoute", () => this.updateState()),
    ];
    this.unsubscribe = () => cleanups.forEach(c => c());
    this.updateState();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
            <style>
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
                    /* above the pages (consultation pages cover the whole screen) */
                    z-index: 1100;
                }

                .counter { text-align: center; }
                .counter-label {
                    font-family: var(--font-design);
                    letter-spacing: var(--tracking-design);
                    font-size: .75rem;
                    color: var(--color-chrome-muted);
                }

                .info,
                .entries {
                    position: absolute;
                    border: none;
                    background: var(--consultation-pill);
                    box-shadow: var(--glass-shadow);
                    color: var(--color-accent);
                    font-family: var(--font-design);
                    letter-spacing: var(--tracking-design);
                    cursor: pointer;
                    pointer-events: all;
                }
                .info {
                    top: calc(max(.75rem, env(safe-area-inset-top)) + var(--debug-offset, 0px));
                    right: 1rem;
                    width: 1.75rem;
                    height: 1.75rem;
                    border-radius: 50%;
                    font-size: .8rem;
                }
                .entries {
                    top: calc(max(2.75rem, env(safe-area-inset-top) + 2rem) + var(--debug-offset, 0px));
                    left: 1.25rem;
                    padding: .35rem .8rem;
                    border-radius: 999px;
                    font-size: .8rem;
                }

                :host([mode="idle"]) .chrome,
                :host(:not([mode="consultation"])) .info,
                :host(:not([mode="consultation"])) .counter-label,
                :host([mode="consultation"]:not([page="entries"])) .counter,
                :host(:not([page="entry"]):not([page="about"])) .entries {
                    display: none;
                }
            </style>
            <div class="chrome">
              <mark-the-page></mark-the-page>
              <div class="counter">
                <entries-counter></entries-counter>
                <div class="counter-label">Entries consulted</div>
              </div>
              <button type="button" class="entries" id="entries">Entries</button>
              <button type="button" class="info" id="info" aria-label="Info">i</button>
            </div>
        `;
  }

  private updateState() {
    this.setAttribute("mode", this.game.state.mode);
    this.setAttribute("page", this.game.state.currentRoute?.page ?? "");
  }

  private initialize() {
    this.shadowRoot!.querySelector("#info")?.addEventListener("click", () => {
      this.game.router.navigate("/about");
    });
    // The entries page opens the last category when no category is given
    this.shadowRoot!.querySelector("#entries")?.addEventListener("click", () => {
      this.game.router.navigate("/entries");
    });
  }
}

customElements.define("game-header", GameHeader);
