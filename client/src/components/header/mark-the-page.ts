import { GameStoreService } from "@/services";
import { GameMode, IGame } from "@/types";
import { t } from "i18next";

/**
 * Mark image per mode. Both modes currently show the same placeholder image until a per-mode animation
 * replaces it. Files live in `public/` so they can be swapped without code changes.
 */
export const MARK_IMAGE_SRC = "/assets/ui/mark-the-page/scan.png";

const MARK_IMAGES: Partial<Record<GameMode, string>> = {
  [GameMode.SCAN]: MARK_IMAGE_SRC,
  [GameMode.CONSULTATION]: MARK_IMAGE_SRC,
};

/**
 * Mark the Page: the avatar / home button. One state per mode; a tap toggles scan ↔ consultation by
 * navigating to the other mode's route (the route sets the mode). Hidden in IDLE.
 */
export class MarkThePage extends HTMLElement {
  private game: Readonly<IGame>;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    this.handleClick = this.handleClick.bind(this);
  }

  connectedCallback() {
    this.unsubscribe = this.game.subscribeToProperty("mode", () => this.render());
    this.addEventListener("click", this.handleClick);
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.removeEventListener("click", this.handleClick);
  }

  private render() {
    if (!this.shadowRoot) return;
    const mode = this.game.state.mode;
    const src = MARK_IMAGES[mode];
    this.toggleAttribute("hidden", !src);
    this.setAttribute("mode", mode);

    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          display: block;
          cursor: pointer;
          pointer-events: all;
          -webkit-tap-highlight-color: transparent;
        }
        :host([hidden]) { display: none; }
        button {
          display: block;
          margin: 0 auto;
          padding: 0;
          border: none;
          background: none;
          cursor: inherit;
        }
        img {
          display: block;
          width: var(--mark-width);
          height: var(--mark-height);
          object-fit: contain;
          transition: transform .2s ease;
        }
        button:active img { transform: scale(.94); }
      </style>
      <button type="button" aria-label="${t(mode === GameMode.SCAN ? "header:openConsultation" : "header:backToScan")}">
        ${src ? `<img src="${src}" alt="${t("common:markAlt")}">` : ""}
      </button>
    `;
  }

  private handleClick() {
    const mode = this.game.state.mode;
    // Consultation opens the entries list with the last category (entries page default)
    if (mode === GameMode.SCAN) this.game.router.navigate("/entries");
    else if (mode === GameMode.CONSULTATION) this.game.router.navigate("/spread");
  }
}

customElements.define("mark-the-page", MarkThePage);
