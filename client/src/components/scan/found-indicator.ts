import { GameStoreService } from "@/services";
import { ENTITY_UNLOCK_MS, GameMode, IGame, Target, TARGET_UNLOCKED_EVENT } from "@/types";
import { getEntry, getTarget } from "@/utils/game-config";
import { adoptDesignStyles } from "@/styles";
import { t } from "i18next";

/** The image's small rotation on the unlock (the first find of a target) */
const UNLOCK_MS = 1200;
/** How long "New entry unlocked" stays for an image target (entity targets: as long as their animation) */
const LABEL_MS = 2600;
/** The label's fade-out before the indicator renders its next state */
const LABEL_FADE_MS = 400;
/** Gold sparkles around the label: position (% of the label box), size (rem), delay (s) */
const SPARKLES: Array<[number, number, number, number]> = [
  [-6, -40, 1.35, 0], [104, -30, 1.05, 0.5], [12, 120, 0.9, 0.9], [92, 115, 1.2, 0.3], [50, -80, 0.8, 1.2],
];

/**
 * The target the indicator shows: the most recently found target **without** an AR entity
 * (targets with an entity show it in the AR scene instead – PLAN Phase 3, taxonomy 1c).
 */
export const getIndicatorTarget = (trackedTargetIds: readonly string[]): Target | undefined =>
  [...trackedTargetIds]
    .reverse()
    .map(id => getTarget(id))
    .find((target): target is Target => !!target && !target.entity);

/**
 * Found-target indicator (design p.9–14, p.35): the entry's image with a drop shadow while its target
 * is found in scan mode. Tap → the entry view (`/entry`) in consultation mode (= consulted).
 * Unlock = the first find of a target (Tilman 2026-09-26; TARGET_UNLOCKED_EVENT from `<ar-bridge>`):
 * "New entry unlocked" – centred, gold with a running shine, a soft glow and twinkling sparkles – and a
 * small rotation of the image; for targets with an AR entity the label only, for as long as the entity's
 * unlock animation plays in the AR scene (ENTITY_UNLOCK_MS).
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

  private handleUnlocked = (event: Event) => {
    const target = getTarget((event as CustomEvent<{ targetId: string }>).detail?.targetId);
    if (target && this.game.state.mode === GameMode.SCAN) this.showUnlock(target);
  };

  connectedCallback() {
    this.cleanups.push(
      this.game.subscribeToProperty("trackedTargets", () => this.update()),
      this.game.subscribeToProperty("mode", () => this.update()),
    );
    this.shadowRoot?.addEventListener("click", this.handleClick);
    document.addEventListener(TARGET_UNLOCKED_EVENT, this.handleUnlocked);
    this.update();
  }

  disconnectedCallback() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    document.removeEventListener(TARGET_UNLOCKED_EVENT, this.handleUnlocked);
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
    // Entity targets (unlocked in the AR scene): the label only, the entity is the picture
    const src = target?.entity ? undefined : entry?.image ?? target?.imageSrc;

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
        /* "New entry unlocked": gold, a shine running through it (as the primary buttons), a soft glow */
        .label.design {           /* .design (shared sheet, later in the cascade) sets the text size */
          position: relative;
          isolation: isolate;
          font-size: 1.5rem;
          line-height: 1.3;
          text-align: center;
          padding: .4rem 1.5rem;
          opacity: 0;
          transform: scale(.6);
          transition: opacity ${LABEL_FADE_MS}ms ease, transform .5s cubic-bezier(.2, 1.4, .4, 1);
        }
        .label .gold {
          background-image:
            linear-gradient(110deg, transparent 40%, var(--gold-1) 50%, transparent 60%),
            var(--gold-gradient);
          background-size: 300% 100%, 100% 100%;
          animation: gold-shine 1.8s linear infinite;
          filter: drop-shadow(0 0 .45rem rgba(243, 204, 148, .45));
        }
        /* A soft dark halo behind the text: gold stays readable over a bright camera image */
        .label::before {
          content: "";
          position: absolute;
          inset: -.8rem -1.2rem;
          z-index: -1;
          background: radial-gradient(closest-side, rgba(0, 0, 0, .65), rgba(0, 0, 0, .4) 55%, transparent);
          filter: blur(.4rem);
        }
        :host([unlocking]) .label {
          opacity: 1;
          transform: none;
        }
        :host([unlocking]) .label .gold { animation: gold-shine 1.8s linear infinite, label-glow 2.4s ease-in-out infinite; }
        @keyframes label-glow {
          50% { filter: drop-shadow(0 0 .9rem rgba(243, 204, 148, .8)); }
        }
        /* Twinkling sparkles around the label */
        .sparkle {
          position: absolute;
          width: var(--size);
          height: var(--size);
          margin: calc(var(--size) / -2) 0 0 calc(var(--size) / -2);
          background: var(--gold-gradient);
          clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
          opacity: 0;
          filter: drop-shadow(0 0 .3rem rgba(245, 231, 200, .9));
        }
        :host([unlocking]) .sparkle { animation: twinkle 1.6s ease-in-out infinite; }
        @keyframes twinkle {
          0%, 100% { opacity: 0; transform: scale(.3) rotate(0deg); }
          50% { opacity: 1; transform: scale(1) rotate(45deg); }
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
          max-width: min(10.6875rem, 55vw);
          max-height: min(13.25rem, 32vh);
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
          :host([unlocking]) img,
          :host([unlocking]) .label .gold,
          :host([unlocking]) .sparkle { animation: none; }
          :host([unlocking]) .sparkle { opacity: .8; }
        }
      </style>
      <div class="label design" aria-hidden="true">
        <span class="gold">${t("scan:newEntryUnlocked")}</span>
        ${SPARKLES.map(([x, y, size, delay]) =>
          `<i class="sparkle" style="left: ${x}%; top: ${y}%; --size: ${size}rem; animation-delay: ${delay}s"></i>`).join("")}
      </div>
      ${target && src ? `<button type="button" aria-label="${t("scan:openEntry", { title: entry?.title ?? "" })}"><img src="${src}" alt=""></button>` : ""}
    `;
  }

  private handleClick(event: Event) {
    const target = this.target;
    if (!target || !(event.target as HTMLElement).closest("button")) return;
    this.open(target.entryId);
  }

  /** "New entry unlocked" + the image's rotation for a moment (the indicator stays tappable) */
  private showUnlock(target: Target) {
    window.clearTimeout(this.unlockTimer);
    if (target.id !== this.target?.id) {
      this.target = target;
      this.render();
      void this.offsetWidth; // style the new content first, so the unlock transitions run
    }
    // Attribute only (no re-render), so the label and image transitions run
    this.removeAttribute("unlocking");
    void this.offsetWidth;
    this.setAttribute("unlocking", "");
    this.shadowRoot?.querySelector(".label")?.removeAttribute("aria-hidden");
    // Entity targets: as long as the unlock animation in the AR scene; then fade out, then the next state
    this.unlockTimer = window.setTimeout(() => {
      this.removeAttribute("unlocking");
      this.shadowRoot?.querySelector(".label")?.setAttribute("aria-hidden", "true");
      this.unlockTimer = window.setTimeout(() => this.update(), LABEL_FADE_MS);
    }, (target.entity ? ENTITY_UNLOCK_MS : LABEL_MS) - LABEL_FADE_MS);
  }

  /** Open the entry in consultation mode (the route sets the mode – RULES #2; the view consults it) */
  private open(entryId: string) {
    this.game.router.navigate("/entry", { key: "entryId", value: entryId });
  }
}

customElements.define("found-indicator", FoundIndicator);
