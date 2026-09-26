import { GameStoreService } from "@/services";
import { IGame } from "@/types";
import { getEntries } from "@/utils/game-config";
import i18next from "i18next";

/**
 * Header counter "12 / 150" = consulted entries / total entries (PLAN Phase 3, decided).
 */
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
        :host {
          display: block;
          font-family: var(--font-design);
          letter-spacing: var(--tracking-design);
          font-size: var(--text-size);
          color: var(--color-muted);
          text-align: center;
        }
      </style>
      <span aria-label="${i18next.t("header:counterAria", { consulted, total })}">${consulted}<span aria-hidden="true"> / </span>${total}</span>
    `;
  }
}

customElements.define("entries-counter", EntriesCounter);
