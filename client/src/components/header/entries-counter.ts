import { GameStoreService } from "@/services";
import type { IGame } from "@/types";
import { getEntries } from "@/utils/game-config";
import { t } from "i18next";

/** Header counter "12 / 150": consulted entries / total entries; re-renders on progress changes. */
export class EntriesCounter extends HTMLElement {
  private game: Readonly<IGame>;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.unsubscribe = this.game.subscribeToProperty("progress", () => this.render());
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private render() {
    if (!this.shadowRoot) return;
    const consulted = this.game.history.getConsultedCount();
    const total = getEntries().length;

    this.shadowRoot.innerHTML = /* html */ `
      <style>
        /* Small and gold, like the label under it (design p. 2, 23) */
        :host {
          display: block;
          font-family: var(--font-design);
          letter-spacing: var(--tracking-design);
          font-size: var(--text-size-small);
<<<<<<< HEAD
=======
          color: var(--color-muted);
>>>>>>> feature/279-areal-typography
          text-align: center;
        }
        span.count {
          background-image: var(--gold-gradient);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
        }
      </style>
      <span class="count" aria-label="${t("header:counterAria", { consulted, total })}">${consulted}<span aria-hidden="true"> / </span>${total}</span>
    `;
  }
}

customElements.define("entries-counter", EntriesCounter);
