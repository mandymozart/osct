import { GameStoreService } from "@/services/GameStoreService";
import { GameMode, IGame, Target } from "@/types";
import { getEntry, getTarget } from "@/utils/game-config";
import { adoptDesignStyles } from "@/styles/design-styles";

/** How long "New entry unlocked" + the rotation play before the entry opens */
const UNLOCK_MS = 1200;

/**
 * The target the indicator shows: the most recently found target **without** an AR entity
 * (targets with an entity show it in A-Frame instead – PLAN Phase 3, taxonomy 1c).
 */
export const getIndicatorTarget = (trackedTargetIds: readonly string[]): Target | undefined =>
  [...trackedTargetIds]
    .reverse()
    .map(id => getTarget(id))
    .find((target): target is Target => !!target && !target.entity);

/**
 * Found-target indicator (design p.9–14, p.35): the entry's image with a drop shadow while its target
 * is found in scan mode. Tap → the entry view (`/entry`) in consultation mode; the first time (entry not
 * consulted yet) "New entry unlocked" and a small rotation play first.
 * Lives in the scan page, so it is hidden in consultation (PLAN: review visibility there).
 */
export class FoundIndicator extends HTMLElement {
  private game: Readonly<IGame>;
  private cleanups: Array<() => void> = [];
  private target: Target | undefined;
  private unlockTimer: number | undefined;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
    this.handleClick = this.handleClick.bind(this);
  }

  connectedCallback() {
    this.cleanups.push(
      this.game.subscribeToProperty("trackedTargets", () => this.update()),
      this.game.subscribeToProperty("mode", () => this.update()),
    );
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.update();
  }

  disconnectedCallback() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    window.clearTimeout(this.unlockTimer);
  }

  private update() {
    const target = this.game.state.mode === GameMode.SCAN ? getIndicatorTarget(this.game.state.trackedTargets) : undefined;
    // Keep the unlock animation running even if tracking flickers
    if (this.hasAttribute("unlocking")) return;
    if (target?.id === this.target?.id) return;
    this.target = target;
    this.render();
  }

  private render() {
    if (!this.shadowRoot) return;
    const target = this.target;
    const entry = target ? getEntry(target.entryId) : undefined;
    this.toggleAttribute("visible", !!target);
    const src = entry?.image ?? target?.imageSrc;

    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          font-family: var(--font-design);
          letter-spacing: var(--tracking-design);
          opacity: 0;
          transform: scale(.96);
          transition: opacity .25s ease, transform .25s ease;
          pointer-events: none;
        }
        :host([visible]) {
          opacity: 1;
          transform: none;
        }
        .label {
          opacity: 0;
          transform: scale(.6);
          transition: opacity .3s ease, transform .4s ease;
        }
        :host([unlocking]) .label {
          opacity: 1;
          transform: none;
        }
        button {
          position: relative;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
          pointer-events: all;
          -webkit-tap-highlight-color: transparent;
        }
        :host(:not([visible])) button { pointer-events: none; }
        /* Measured: 171 × 212 px (DESIGN.md §3) */
        img {
          display: block;
          max-width: min(171px, 55vw);
          max-height: min(212px, 32vh);
          object-fit: contain;
          box-shadow: 0 .6rem 1.2rem rgba(0, 0, 0, .35);
        }
        /* Elliptic ground shadow (design frame 9) */
        button::after {
          content: "";
          position: absolute;
          left: -20%;
          right: -20%;
          bottom: -1.2rem;
          height: 2.2rem;
          z-index: -1;
          background: radial-gradient(closest-side, rgba(0, 0, 0, .35), transparent);
        }
        :host([unlocking]) img {
          animation: unlock ${UNLOCK_MS}ms ease-in-out;
        }
        @keyframes unlock {
          0% { transform: rotate(0); }
          25% { transform: rotate(-4deg); }
          60% { transform: rotate(3deg); }
          100% { transform: rotate(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          :host([unlocking]) img { animation: none; }
        }
      </style>
      <div class="label design gold" aria-hidden="true">New entry unlocked</div>
      ${target && src ? `<button type="button" aria-label="Open entry ${entry?.title ?? ""}"><img src="${src}" alt=""></button>` : ""}
    `;
  }

  private handleClick(event: Event) {
    const target = this.target;
    if (!target || !(event.target as HTMLElement).closest("button") || this.hasAttribute("unlocking")) return;
    const entryId = target.entryId;

    if (this.game.history.isConsulted(entryId)) {
      this.open(entryId);
      return;
    }
    // Attribute only (no re-render), so the label and image transitions run
    this.setAttribute("unlocking", "");
    this.shadowRoot?.querySelector(".label")?.removeAttribute("aria-hidden");
    this.unlockTimer = window.setTimeout(() => {
      this.removeAttribute("unlocking");
      this.open(entryId);
      this.update();
    }, UNLOCK_MS);
  }

  /** Open the entry in consultation mode (the route sets the mode – RULES #2; the view consults it) */
  private open(entryId: string) {
    this.game.router.navigate("/entry", { key: "entryId", value: entryId });
  }
}

customElements.define("found-indicator", FoundIndicator);
