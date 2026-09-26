import { GameStoreService } from "@/services";
import { IGame, Spread } from "@/types";
import { formatPages, getMenuSpreads, loopCopies, normalizeLoopScroll } from "./spread-menu-loop";
import { adoptDesignStyles } from "@/styles";
import { tHtml } from "@/i18n";

/** Scroll has to rest this long before the loop is re-centered and the spread activated */
const SETTLE_MS = 140;
/** Extra wait before activating: loading a spread restarts AR (debounce, PLAN Phase 3) */
const ACTIVATE_MS = 250;
const HAPTIC_MS = 8;

/**
 * "Pages activated" – looped horizontal spread menu at the bottom of scan mode (design p.6–7).
 * Lists only spreads with content; the item under the center gets the glass highlight; a short
 * vibration marks each new item (Android – iOS Safari has no `navigator.vibrate`). When the scroll
 * settles, the centered spread is activated (debounced).
 */
export class SpreadMenu extends HTMLElement {
  private game: Readonly<IGame>;
  private unsubscribe: (() => void) | null = null;
  private spreads: Spread[] = [];
  private copies = 1;
  private copyWidth = 0;
  private centeredId: string | null = null;
  private settleTimer: number | undefined;
  private activateTimer: number | undefined;
  private frame: number | undefined;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  connectedCallback() {
    this.spreads = getMenuSpreads();
    this.renderShell();
    this.track?.addEventListener("scroll", this.handleScroll, { passive: true });
    this.track?.addEventListener("click", this.handleClick);
    this.unsubscribe = this.game.subscribeToProperty("currentSpread", (id) => {
      if (id && id !== this.centeredId) this.scrollToSpread(id);
    });
    this.resizeObserver = new ResizeObserver(() => this.build());
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.track?.removeEventListener("scroll", this.handleScroll);
    this.track?.removeEventListener("click", this.handleClick);
    window.clearTimeout(this.settleTimer);
    window.clearTimeout(this.activateTimer);
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  private get track(): HTMLElement | null {
    return this.shadowRoot?.querySelector(".track") ?? null;
  }

  private renderShell() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          display: block;
          font-family: var(--font-design);
          letter-spacing: var(--tracking-design);
          pointer-events: none;
        }
        :host([hidden]) { display: none; }
        .label {
          text-align: center;
          color: var(--color-muted);
          margin-bottom: .35rem;
        }
        .track {
          display: flex;
          gap: .75rem;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          padding: .5rem 0 .75rem;
          pointer-events: all;
          -webkit-mask-image: linear-gradient(to right, transparent, #000 25%, #000 75%, transparent);
          mask-image: linear-gradient(to right, transparent, #000 25%, #000 75%, transparent);
        }
        .track::-webkit-scrollbar { display: none; }
        /* Inactive items: plain text; the centred one gets .pill + a .gold label (design p.6–7) */
        .item {
          flex: none;
          scroll-snap-align: center;
          min-height: 1.8rem;
          padding: 0 1rem;          /* = .pill, no layout shift when an item becomes the pill */
          border: none;
          border-radius: 999rem;
          background: none;
          color: var(--color-inactive);
          font: inherit;
          letter-spacing: inherit;
          white-space: nowrap;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
      </style>
      <div class="label design" id="label">${tHtml("scan.pagesActivated")}</div>
      <div class="track design" role="listbox" aria-labelledby="label"></div>
    `;
    this.toggleAttribute("hidden", this.spreads.length === 0);
  }

  /** Render one copy, measure it, then render as many copies as the loop needs */
  private build() {
    const track = this.track;
    if (!track || this.spreads.length === 0 || track.clientWidth === 0) return;

    track.innerHTML = this.itemsHtml(0);
    const items = track.querySelectorAll<HTMLElement>(".item");
    const first = items[0];
    const last = items[items.length - 1];
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    this.copyWidth = last.offsetLeft + last.offsetWidth - first.offsetLeft + gap;
    this.copies = loopCopies(this.copyWidth, track.clientWidth);

    track.innerHTML = Array.from({ length: this.copies }, (_, copy) => this.itemsHtml(copy)).join("");
    this.scrollToSpread(this.game.state.currentSpread ?? this.spreads[0].id);
  }

  private itemsHtml(copy: number): string {
    const middle = copy === Math.floor(this.copies / 2);
    return this.spreads
      .map(s => `<button type="button" class="item" role="option" data-spread="${s.id}" data-copy="${copy}"
        ${middle ? "" : 'aria-hidden="true" tabindex="-1"'} aria-label="${tHtml("scan.pagesAria", { pages: formatPages(s) })}"><span>${formatPages(s)}</span></button>`)
      .join("");
  }

  /**
   * Center the spread's item in the middle copy, without animation. The centered id is updated right
   * away, so the resulting scroll events neither vibrate nor switch (the spread is already current).
   */
  private scrollToSpread(spreadId: string) {
    const track = this.track;
    const middle = Math.floor(this.copies / 2);
    const item = track?.querySelector<HTMLElement>(`.item[data-spread="${spreadId}"][data-copy="${middle}"]`);
    if (!track || !item) return;
    track.scrollLeft = item.offsetLeft + item.offsetWidth / 2 - track.clientWidth / 2;
    this.updateCentered();
  }

  private handleScroll() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.updateCentered());
    window.clearTimeout(this.settleTimer);
    window.clearTimeout(this.activateTimer);
    this.settleTimer = window.setTimeout(() => this.settle(), SETTLE_MS);
  }

  /** Highlight the item under the center; haptic tick when another spread comes under it */
  private updateCentered() {
    const track = this.track;
    if (!track) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    let nearest: HTMLElement | null = null;
    let distance = Infinity;
    track.querySelectorAll<HTMLElement>(".item").forEach(item => {
      const d = Math.abs(item.offsetLeft + item.offsetWidth / 2 - center);
      if (d < distance) {
        distance = d;
        nearest = item;
      }
    });
    if (!nearest) return;
    const centered: HTMLElement = nearest;

    track.querySelectorAll(".item.centered").forEach(item => {
      if (item === centered) return;
      item.classList.remove("centered", "pill");
      item.firstElementChild?.classList.remove("gold");
      item.removeAttribute("aria-selected");
    });
    centered.classList.add("centered", "pill");
    centered.firstElementChild?.classList.add("gold");
    centered.setAttribute("aria-selected", "true");

    const id = centered.dataset.spread ?? null;
    if (id !== this.centeredId) {
      if (this.centeredId !== null) navigator.vibrate?.(HAPTIC_MS);
      this.centeredId = id;
    }
  }

  /** Scroll came to rest: keep the loop in the middle copy, then activate the centered spread */
  private settle() {
    const track = this.track;
    if (!track) return;
    const normalized = normalizeLoopScroll(track.scrollLeft, track.clientWidth, this.copyWidth, this.copies);
    if (Math.abs(normalized - track.scrollLeft) > 1) track.scrollLeft = normalized; // same item: no tick
    this.updateCentered();

    this.activateTimer = window.setTimeout(() => this.activate(), ACTIVATE_MS);
  }

  private activate() {
    const id = this.centeredId;
    if (id && id !== this.game.state.currentSpread) this.game.spreads.switchSpread(id);
  }

  private handleClick(event: Event) {
    const item = (event.target as HTMLElement).closest<HTMLElement>(".item");
    const track = this.track;
    if (!item || !track) return;
    // Already under the center: no scroll will follow, activate directly
    if (item.classList.contains("centered")) {
      this.activate();
      return;
    }
    track.scrollTo({
      left: item.offsetLeft + item.offsetWidth / 2 - track.clientWidth / 2,
      behavior: "smooth",
    });
  }
}

customElements.define("spread-menu", SpreadMenu);
