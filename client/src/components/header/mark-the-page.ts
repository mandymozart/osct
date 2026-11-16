import { GameStoreService } from "@/services";
import { GameMode, Pages, type IGame } from "@/types";
import { getEntry, getTargets } from "@/utils/game-config";
import { escapeHtml } from "@/utils";
import { t } from "i18next";

/**
 * Mark image per mode. Both modes show the same icon (the design's eye placeholder replaces it with #281); in
 * consultation the current target's picture sits beside it (#283). Files live in `public/` so they can be swapped
 * without code changes.
 */
export const MARK_IMAGE_SRC = "/assets/ui/mark-the-page/scan.png";

const MARK_IMAGES: Partial<Record<GameMode, string>> = {
  [GameMode.SCAN]: MARK_IMAGE_SRC,
  [GameMode.CONSULTATION]: MARK_IMAGE_SRC,
};

/**
 * The picture of the current target beside the icon in consultation (design p. 23): on an entry's page its own
 * target; elsewhere the current spread's target found last, else the spread's first target. Null when there is no
 * spread or it has no image target.
 */
export const currentTargetImage = (game: Readonly<IGame>): string | null => {
  const route = game.state.currentRoute;
  if (route?.page === Pages.ENTRY && route.param) {
    const src = getEntry(String(route.param.value))?.target?.imageSrc;
    if (src) return src;
  }
  const spreadId = game.state.currentSpread ?? game.state.progress.lastSpreadId;
  if (!spreadId) return null;
  const targets = getTargets(spreadId).filter(target => target.imageSrc);
  const unlocked = game.state.progress.unlocked;
  const found = targets
    .filter(target => unlocked[target.id] !== undefined)
    .sort((a, b) => unlocked[b.id] - unlocked[a.id]);
  return (found[0] ?? targets[0])?.imageSrc ?? null;
};

/**
 * Mark the Page: the avatar / home button. One state per mode; a tap toggles scan ↔ consultation by
 * navigating to the other mode's route (the route sets the mode); the tap sound comes with every button
 * (FeedbackService, when Sounds is on). Hidden in IDLE.
 */
export class MarkThePage extends HTMLElement {
  private game: Readonly<IGame>;
  private unsubscribe: (() => void) | null = null;
  /** The last markup: progress changes often, and an unchanged picture must not be reloaded */
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
      this.game.subscribeToProperty("currentRoute", () => this.render()),
      this.game.subscribeToProperty("currentSpread", () => this.render()),
      this.game.subscribeToProperty("progress", () => this.render()),
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
    const target = mode === GameMode.CONSULTATION ? currentTargetImage(this.game) : null;
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
        /* The target's picture: a slanted card behind the icon's right edge, about as tall as the drawing (design p. 23) */
        .target {
          position: absolute;
          top: calc(var(--mark-inset-top) + var(--mark-height) * .04);
          left: calc(var(--mark-width) * .6);
          width: calc(var(--mark-height) * .6);
          height: calc(var(--mark-height) * .72);
          object-fit: cover;
          transform: skewX(-18deg);
          box-shadow: var(--shadow-dark);
        }
      </style>
      <button type="button" aria-label="${t(mode === GameMode.SCAN ? "header:openConsultation" : "header:backToScan")}">
        ${target ? `<img class="target" src="${escapeHtml(target)}" alt="" data-target-image>` : ""}
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
    else if (mode === GameMode.CONSULTATION) this.game.router.navigate("/spread");
  }
}

customElements.define("mark-the-page", MarkThePage);
