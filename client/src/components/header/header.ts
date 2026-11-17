import { GameStoreService } from "@/services";
import { type IGame, Pages } from "@/types";
import "./entries-counter";
import "./mark-the-page";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";
import { t } from "i18next";

/**
 * Top chrome, per mode (reflected in the `mode` and `page` attributes):
 * - IDLE (home, tutorial): nothing.
 * - SCAN: Mark the Page only (#283).
 * - CONSULTATION: Mark with the current target's picture beside it + a white "i" (→ About); the counter with
 *   "Marginalia consulted" only on the entries list. A backdrop lets the pages scroll under the header (#283).
 *   The "Entries" back button lives in ConsultationPage, not here. On Info and the image credits a gold × takes the
 *   place of the "i" (#291): Info closes to the entries list, the credits back to Info.
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
                    /* 1rem below the safe area, level with the "i"; the dev debug line overlays it without shifting it */
                    padding-top: calc(env(safe-area-inset-top) + 1rem);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    pointer-events: none;
                    /* above the full-screen consultation pages */
                    z-index: 1100;
                }
                /* The header is transparent: the pages scroll under it (Tilman, #297) */

                /* Compensates the eye image's transparent top margin; the counter follows close below (design p. 53) */
                mark-the-page {
                    margin-top: calc(-1 * var(--mark-inset-top));
                }
                .counter { text-align: center; }
                /* Two classes: the adopted design styles come after this sheet (.design sets the Medium size) */
                .counter .counter-label { font-size: var(--text-size-small); }

                .info, .close {
                    position: absolute;
                    pointer-events: all;
                }
                /* The "i": Medium text in white, not gold (design p. 2, 26); the × stays gold */
                .chrome .info { font-size: var(--text-size); }
                /* The gold glow marks the active item (the selected list); the "i" never is: it has the grey shadow of
                   an inactive button, like Videos while a Marginalia category is shown */
                .chrome .info { box-shadow: var(--shadow-grey); }
                .info .gold {
                    background: none;
                    color: var(--color-on-dark);
                    -webkit-text-fill-color: currentColor;
                }
                /* Same gap above and to the right, counted below the safe area (DESIGN.md §3) */
                .info, .close {
                    top: calc(env(safe-area-inset-top) + 1rem);
                    right: 1rem;
                }

                :host([mode="idle"]) .chrome,
                :host(:not([mode="consultation"])) .info,
                :host(:not([mode="consultation"])) .close,
                :host([page="about"]) .info,
                :host([page="credits"]) .info,
                :host(:not([page="about"]):not([page="credits"])) .close,
                :host(:not([mode="consultation"])) .counter,
                :host([mode="consultation"]:not([page="entries"])) .counter {
                    display: none;
                }
            </style>
            <div class="chrome">
              <mark-the-page></mark-the-page>
              <div class="counter">
                <entries-counter></entries-counter>
                <div class="counter-label design gold">${t("header:entriesConsulted")}</div>
              </div>
              ${goldButton({ label: "i", shape: "icon", className: "info", attrs: { id: "info", "aria-label": t("header:info") } })}
              ${goldButton({ label: "×", shape: "icon", className: "close", attrs: { id: "close", "aria-label": t("header:close") } })}
            </div>
        `;
  }

  private updateState() {
    this.setAttribute("mode", this.game.state.mode);
    this.setAttribute("page", this.game.state.currentRoute?.page ?? "");
  }

  private initialize() {
    this.shadowRoot?.querySelector("#info")?.addEventListener("click", () => {
      this.game.router.navigate("/about");
    });
    this.shadowRoot?.querySelector("#close")?.addEventListener("click", () => {
      this.game.router.navigate(this.game.state.currentRoute?.page === Pages.CREDITS ? "/about" : "/entries");
    });
  }
}

customElements.define("game-header", GameHeader);
