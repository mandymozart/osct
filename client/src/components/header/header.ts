import { GameStoreService } from "@/services";
import { IGame } from "@/types";
import "./entries-counter";
import "./mark-the-page";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";
import { t } from "i18next";

/**
 * Top chrome, per mode (reflected in the `mode` and `page` attributes):
 * - IDLE (home, tutorial): nothing.
 * - SCAN: Mark the Page + counter.
 * - CONSULTATION: Mark + "i" (→ About); the counter with "Entries consulted" only on the entries list.
 *   The "Entries" back button lives in ConsultationPage, not here.
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
                    gap: .25rem;
                    pointer-events: none;
                    /* above the full-screen consultation pages */
                    z-index: 1100;
                }

                /* Compensates the Mark image's transparent top margin; the counter below keeps its place */
                mark-the-page {
                    margin-top: calc(-1 * var(--mark-inset-top));
                    margin-bottom: var(--mark-inset-top);
                }
                .counter { text-align: center; }
                .counter-label { color: var(--color-muted); }

                .info {
                    position: absolute;
                    pointer-events: all;
                }
                /* Same gap above and to the right, counted below the safe area (DESIGN.md §3) */
                .info {
                    top: calc(env(safe-area-inset-top) + 1rem);
                    right: 1rem;
                }

                :host([mode="idle"]) .chrome,
                :host(:not([mode="consultation"])) .info,
                :host(:not([mode="consultation"])) .counter-label,
                :host([mode="consultation"]:not([page="entries"])) .counter {
                    display: none;
                }
            </style>
            <div class="chrome">
              <mark-the-page></mark-the-page>
              <div class="counter">
                <entries-counter></entries-counter>
                <div class="counter-label design">${t("header:entriesConsulted")}</div>
              </div>
              ${goldButton({ label: "i", shape: "icon", className: "info", attrs: { id: "info", "aria-label": t("header:info") } })}
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
  }
}

customElements.define("game-header", GameHeader);
