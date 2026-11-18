import { GameStoreService } from "@/services";
import { GameMode, type IGame } from "@/types";
import { ONBOARDING_ICON_SRC } from "@/utils/static-splash-html";
import { t } from "i18next";

/**
 * The old Mark image. The header shows the crocodile eye of the onboarding instead (#297, `ONBOARDING_ICON_SRC`); the
 * Mark files stay in `public/assets/ui/mark-the-page/`.
 */
export const MARK_IMAGE_SRC = "/assets/ui/mark-the-page/scan.png";

/** The header icon per mode: the eye in scan and consultation (#297). Files live in `public/` (swap without code) */
const MARK_IMAGES: Partial<Record<GameMode, string>> = {
  [GameMode.SCAN]: ONBOARDING_ICON_SRC,
  [GameMode.CONSULTATION]: ONBOARDING_ICON_SRC,
};

/**
 * Mark the Page: the avatar / home button. One state per mode; a tap toggles scan ↔ consultation by
 * navigating to the other mode's route (the route sets the mode); the tap sound comes with every button
 * (FeedbackService, when Sounds is on). Hidden in IDLE.
 */
export class MarkThePage extends HTMLElement {
  private game: Readonly<IGame>;
  private unsubscribe: (() => void) | null = null;
  /** The last markup: an unchanged picture must not be reloaded */
  private rendered = "";

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    this.handleClick = this.handleClick.bind(this);
  }

  connectedCallback() {
    const cleanups = [
      this.game.subscribeToProperty("mode", () => this.render()),
    ];
    this.unsubscribe = () => cleanups.forEach(cleanup => cleanup());
    this.addEventListener("click", this.handleClick);
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.rendered = "";
    this.removeEventListener("click", this.handleClick);
  }

  private render() {
    if (!this.shadowRoot) return;
    const mode = this.game.state.mode;
    const src = MARK_IMAGES[mode];
    this.toggleAttribute("hidden", !src);
    this.setAttribute("mode", mode);

    const html = /* html */ `
      <style>
        :host {
          display: block;
          cursor: pointer;
          pointer-events: all;
          -webkit-tap-highlight-color: transparent;
        }
        :host([hidden]) { display: none; }
        button {
          position: relative;
          display: block;
          margin: 0 auto;
          padding: 0;
          border: none;
          background: none;
          cursor: inherit;
          transition: transform .2s ease;
        }
        button:active { transform: scale(.94); }
        .mark {
          position: relative;
          display: block;
          width: var(--mark-width);
          height: var(--mark-height);
          object-fit: contain;
        }
      </style>
      <button type="button" aria-label="${t(mode === GameMode.SCAN ? "header:openConsultation" : "header:backToScan")}">
        ${src ? `<img class="mark" src="${src}" alt="${t("common:markAlt")}">` : ""}
      </button>
    `;
    if (html === this.rendered) return;
    this.rendered = html;
    this.shadowRoot.innerHTML = html;
  }

  private handleClick() {
    const mode = this.game.state.mode;
    // Consultation opens the entries list with the last category (entries page default)
    if (mode === GameMode.SCAN) this.game.router.navigate("/entries");
    else if (mode === GameMode.CONSULTATION) this.game.router.navigate("/scene");
  }
}

customElements.define("mark-the-page", MarkThePage);
