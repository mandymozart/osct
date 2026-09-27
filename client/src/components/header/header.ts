import { GameStoreService } from "@/services";
import { IGame } from "@/types";
import "./entries-counter";
import "./mark-the-page";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";
import i18next from "i18next";

/**
 * Top chrome, per mode (design 260804):
 * - IDLE (home, tutorial): nothing (the former name line "Kevin Bray — Onion Skin and Crocodile Tears"
 *   was removed on 2026-09-25 – previous design iteration).
 * - SCAN: Mark the Page + counter (frame 6).
 * - CONSULTATION: Mark + "i" → Info (= about, frames 15, 17, 32); the counter
 *   with "Entries consulted" only on the entries list (frame 17); "Entries" → back to the list with
 *   the last category on the entry view (frames 15, 21); Info has it in the page (about-page.ts).
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
                    /* Mark 1rem from the top of the page area, level with the "i" (Tilman 2026-09-27).
                       The dev debug line lies over it and moves nothing – as in the final app. */
                    padding-top: calc(env(safe-area-inset-top) + 1rem);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: .25rem;
                    pointer-events: none;
                    /* above the pages (consultation pages cover the whole screen) */
                    z-index: 1100;
                }

                /* The visible Mark 1rem from the top: up by the image's transparent margin; the counter
                   below keeps its place */
                mark-the-page {
                    margin-top: calc(-1 * var(--mark-inset-top));
                    margin-bottom: var(--mark-inset-top);
                }
                .counter { text-align: center; }
                .counter-label { color: var(--color-muted); }

                .info,
                .entries {
                    position: absolute;
                    pointer-events: all;
                }
                /* Frame 20 (Tilman 2026-09-27), measured from the top of the page area – below the status bar
                   in the home-screen app (DESIGN.md §3): "i" in the top right corner, the same gap above and
                   to the right; "Entries" centre ≈ 4.7rem down, left edge on the text column */
                .info {
                    top: calc(env(safe-area-inset-top) + 1rem);
                    right: 1rem;
                }
                .entries {
                    top: calc(env(safe-area-inset-top) + 3.75rem);
                    left: 1.25rem;
                }

                :host([mode="idle"]) .chrome,
                :host(:not([mode="consultation"])) .info,
                :host(:not([mode="consultation"])) .counter-label,
                :host([mode="consultation"]:not([page="entries"])) .counter,
                /* Info has its own "Entries" pill in the page, where the entries list has its category pill */
                :host(:not([page="entry"])) .entries {
                    display: none;
                }
            </style>
            <div class="chrome">
              <mark-the-page></mark-the-page>
              <div class="counter">
                <entries-counter></entries-counter>
                <div class="counter-label design">${i18next.t("header:entriesConsulted")}</div>
              </div>
              ${goldButton({ label: i18next.t("header:entries"), className: "entries", attrs: { id: "entries" } })}
              ${goldButton({ label: "i", shape: "icon", className: "info", attrs: { id: "info", "aria-label": i18next.t("header:info") } })}
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
