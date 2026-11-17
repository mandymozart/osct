import { GameStoreService } from "@/services";
import { CARD_FLIGHT_EVENT, type CardFlightDetail, ENTITY_UNLOCK_MS, EntryCategory, GameMode, type IGame, momentDuration, type Target, TARGET_UNLOCKED_EVENT } from "@/types";
import { getBook, getEntry, getTarget } from "@/utils/game-config";
import { adoptDesignStyles } from "@/styles";
import { t } from "i18next";

/** How long "New marginalia unlocked" stays for an image target (entity targets: as long as their animation) */
const LABEL_MS = 2600;
/** The label's fade-out before the indicator renders its next state */
const LABEL_FADE_MS = 400;

/**
 * The target the indicator shows: the most recently found target **without** an AR entity
 * (targets with an entity show it in the AR scene instead).
 */
export const getIndicatorTarget = (trackedTargetIds: readonly string[]): Target | undefined =>
  [...trackedTargetIds]
    .reverse()
    .map(id => getTarget(id))
    .find((target): target is Target => !!target && !target.entity);

/**
 * Found-target indicator: no picture of its own (#297) – the page in the camera picture is the picture, the card flight
 * (#285) the one animation. While a target without an AR entity is found in scan mode it lays a transparent tap area
 * over the middle of the screen: a tap opens the entry view (`/entry`) in consultation mode, which marks the entry
 * consulted. A glossary entry not consulted yet flies its card first (CARD_FLIGHT_EVENT – `<ar-bridge>` asks the scene),
 * "New marginalia unlocked" shows with it, and the entry opens when it lands. Reduced motion: the entry opens at once.
 * On unlock (the first find of a target, TARGET_UNLOCKED_EVENT from `<ar-bridge>`) it shows the gold shimmering
 * "New marginalia unlocked" (the sound comes from the TargetManager); for targets with an AR entity for as long as the
 * entity's reveal takes: the duration of the look the book names for it (ENTITY_UNLOCK_MS where only a plugin's code
 * knows it).
 * Lives in the scan page, so it is hidden in consultation mode.
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
    // Entity targets (unlocked in the AR scene): the label only, the entity takes the taps itself

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
        .label.design {           /* outranks the shared .design text size, which comes later in the cascade */
          font-size: 1.5rem;
          line-height: 1.3;
          text-align: center;
          padding: .4rem 1.5rem;
          opacity: 0;
          transition: opacity ${LABEL_FADE_MS}ms ease;
        }
        /* Shown on the unlock and while the card flies (#297); the shimmer is the shared .gold.shimmer (#280) */
        :host([unlocking]) .label,
        :host([flying]) .label { opacity: 1; }
        /* The tap area: transparent, where the found page sits in the camera picture (no picture, frame or shadow, #297) */
        button {
          display: block;
          width: min(20rem, 80vw);
          height: min(20rem, 40vh);
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
          pointer-events: all;
          -webkit-tap-highlight-color: transparent;
        }
        :host(:not([visible])) button,
        :host([flying]) button { pointer-events: none; }
      </style>
      <div class="label design" aria-hidden="true">
        <span class="gold shimmer">${t("scan:newEntryUnlocked")}</span>
      </div>
      ${target && !target.entity ? `<button type="button" aria-label="${t("scan:openEntry", { title: entry?.title ?? "" })}"></button>` : ""}
    `;
  }

  private handleClick(event: Event) {
    const target = this.target;
    if (!target || this.hasAttribute("flying") || !(event.target as HTMLElement).closest("button")) return;
    const flown = this.flyCard(target);
    if (!flown) return this.open(target.entryId);
    this.setAttribute("flying", "");
    void flown.catch(() => false).then(() => {
      this.removeAttribute("flying");
      this.open(target.entryId);
    });
  }

  /** The card flight for a glossary entry not consulted yet, null when there is none (the entry opens at once) */
  private flyCard(target: Target): Promise<boolean> | null {
    const entry = getEntry(target.entryId);
    // It flies as the printed picture and becomes the entry's own when it hits the screen
    const front = target.imageSrc;
    const reveal = entry?.image && entry.image !== front ? entry.image : undefined;
    if (target.entity || !entry || !front || entry.category !== EntryCategory.Glossary) return null;
    if (this.game.history.isConsulted(entry.id)) return null;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    let flown: Promise<boolean> | null = null;
    const detail: CardFlightDetail = { targetId: target.id, front, reveal, respond: promise => (flown = promise) };
    const event = new CustomEvent(CARD_FLIGHT_EVENT, { detail, cancelable: true });
    return document.dispatchEvent(event) ? null : flown;
  }

  /** Shows "New marginalia unlocked"; the indicator stays tappable */
  private showUnlock(target: Target) {
    window.clearTimeout(this.unlockTimer);
    if (target.id !== this.target?.id) {
      this.target = target;
      this.render();
      void this.offsetWidth; // style the new content first, so the unlock transitions run
    }
    // Attribute only (no re-render), so the label transition runs
    this.removeAttribute("unlocking");
    void this.offsetWidth;
    this.setAttribute("unlocking", "");
    this.shadowRoot?.querySelector(".label")?.removeAttribute("aria-hidden");
    // Entity targets: label stays for the AR unlock animation; then fade out and render the next state
    this.unlockTimer = window.setTimeout(() => {
      this.removeAttribute("unlocking");
      this.shadowRoot?.querySelector(".label")?.setAttribute("aria-hidden", "true");
      this.unlockTimer = window.setTimeout(() => this.update(), LABEL_FADE_MS);
    }, (target.entity ? momentDuration(getBook(), "reveal", target.entity) ?? ENTITY_UNLOCK_MS : LABEL_MS) - LABEL_FADE_MS);
  }

  /** Open the entry in consultation mode (the route sets the mode; the entry view marks it consulted) */
  private open(entryId: string) {
    this.game.router.navigate("/entry", { key: "entryId", value: entryId });
  }
}

customElements.define("found-indicator", FoundIndicator);
