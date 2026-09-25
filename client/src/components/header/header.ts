import { GameStoreService } from "@/services/GameStoreService";
import { IGame } from "@/types/game";
import "./entries-counter";
import "./mark-the-page";
import { adoptDesignStyles } from "@/styles/design-styles";
import { goldButton } from "@/components/buttons";

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
    adoptDesignStyles(this.shadowRoot);
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
                .counter-label { color: var(--color-muted); }

                .info,
                .entries {
                    position: absolute;
                    pointer-events: all;
                }
                /* Measured: "i" centre 90 px, "Entries" centre 117 px from the screen top (DESIGN.md §3) */
                .info {
                    top: calc(max(4.55rem, env(safe-area-inset-top)) + var(--debug-offset, 0px));
                    right: 1rem;
                }
                .entries {
                    top: calc(max(6.4rem, env(safe-area-inset-top) + 2rem) + var(--debug-offset, 0px));
                    left: 1.25rem;
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
                <div class="counter-label design">Entries consulted</div>
              </div>
              ${goldButton({ label: "Entries", className: "entries", attrs: { id: "entries" } })}
              ${goldButton({ label: "i", shape: "icon", className: "info", attrs: { id: "info", "aria-label": "Info" } })}
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
