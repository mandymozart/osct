import { GameStoreService } from "@/services";
import { type Entry, EntryCategory, type IGame, type ListCategory } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { escapeHtml } from "@/utils";
import { getSpread } from "@/utils/game-config";
import { DEFAULT_CATEGORY, entryLabel, entryLabelHtml, groupEntries, pageLabel } from "./entries-model";
import { t } from "i18next";

/** How long a cut-off name rests before it scrolls (Tilman, design p. 40) */
export const MARQUEE_DELAY_MS = 2000;
/** Marquee speed in rem per second */
const MARQUEE_SPEED_REM = 2.5;

/**
 * Entries of one category, or All (#287): a "Name | Page" table ("Title | Page" for texts), sorted – the glossary
 * grouped by letter, All by page – one gold gradient across the whole list. Every entry is listed from the start:
 * consulted ones can be opened, the others are greyed and cannot (Tilman 2026-11-16). The Videos list is white and
 * not clickable at all – a video is found by scanning its page (#288). A name too long for its line ends in "…" and,
 * after 2 s, scrolls once to its end and back (not with reduced motion). The page passes the entries (`setEntries`).
 */
export class EntriesList extends HTMLElement {
  private game: Readonly<IGame>;
  private category: ListCategory = DEFAULT_CATEGORY;
  private entries: Entry[] = [];
  private marqueeTimer: number | undefined;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  /** Show `entries` of `category` (the list keeps those of the category) – the category decides grouping and order */
  setEntries(category: ListCategory, entries: Entry[]) {
    this.category = category;
    this.entries = entries;
    this.render();
  }

  connectedCallback() {
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.shadowRoot?.addEventListener("animationend", this.handleMarqueeEnd);
    this.render();
  }

  disconnectedCallback() {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    this.shadowRoot?.removeEventListener("animationend", this.handleMarqueeEnd);
    window.clearTimeout(this.marqueeTimer);
  }

  private get isVideos(): boolean {
    return this.category === EntryCategory.Video;
  }

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host { display: block; }
        ul { margin: 0; padding: 0; list-style: none; }
        .row, .head {
          display: flex;
          align-items: center;
          gap: .5rem;
          box-sizing: border-box;
          width: 100%;
          min-height: var(--row-height);
          padding: 0;
          border: none;
          border-top: var(--rule);
          border-bottom: var(--rule);
          margin-top: -0.0625rem;
          background: none;
          font: inherit;
          letter-spacing: inherit;
          text-align: left;
        }
        button.row { cursor: pointer; }
        .head { color: var(--color-muted); margin-bottom: var(--row-height); }
        /* The first letter keeps one row of air above it, not two – the head's margin is the other */
        .head + ul > .letter:first-child { min-height: var(--row-height); }
        .label {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .page { flex: none; text-align: right; font-variant-numeric: tabular-nums; }
        .row.locked { color: var(--color-muted); -webkit-text-fill-color: var(--color-muted); }
        .videos .row { color: var(--color-on-dark); }
        .letter {
          display: flex;
          align-items: flex-end;
          min-height: calc(var(--row-height) * 2);
          border-bottom: var(--rule);
        }
        .hint { margin: 0 0 1.5rem; }
        .empty { margin: 0; color: var(--color-muted); }
        .visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }
        /* The marquee: the name scrolls to its end, rests, and comes back; then the "…" returns */
        .label.scrolling { text-overflow: clip; }
        .label.scrolling .text {
          display: inline-block;
          animation: marquee var(--marquee-duration) ease-in-out 1;
        }
        @keyframes marquee {
          0%, 10% { transform: translateX(0); }
          45%, 60% { transform: translateX(var(--marquee-shift)); }
          95%, 100% { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .label.scrolling .text { animation: none; }
        }
      </style>
      ${this.listHtml()}
    `;
    this.scheduleMarquee();
  }

  private listHtml(): string {
    const hint = this.isVideos ? `<p class="hint">${t("entries:videosHint")}</p>` : "";
    const groups = groupEntries(this.entries, this.category);
    if (groups.length === 0) return `${hint}<p class="empty">${t("entries:empty")}</p>`;
    const nameHeader = this.category === EntryCategory.Text ? t("entries:title") : t("entries:name");
    // One gradient spans the whole list, so names run from pale to gold top to bottom; the Videos are white (#288)
    return /* html */ `
      ${hint}
      <div class="head" role="presentation"><span class="label">${nameHeader}</span><span class="page">${t("entries:page")}</span></div>
      <ul class="${this.isVideos ? "videos" : "gold"}">${groups
        .map(g => `${g.letter ? `<li class="letter" aria-hidden="true">${g.letter}</li>` : ""}${g.entries.map(e => this.rowHtml(e)).join("")}`)
        .join("")}</ul>`;
  }

  private rowHtml(entry: Entry): string {
    const page = escapeHtml(pageLabel(entry.page, getSpread(entry.spreadId)));
    const cells = `<span class="label"><span class="text">${entryLabelHtml(entry)}</span></span><span class="page">${page}</span>`;
    if (this.isVideos) return `<li><div class="row">${cells}</div></li>`;
    if (!this.game.history.isConsulted(entry.id)) {
      return `<li><div class="row locked" aria-disabled="true">${cells}<span class="visually-hidden">${t("entries:locked")}</span></div></li>`;
    }
    return `<li><button type="button" class="row" data-entry="${escapeHtml(entry.id)}" aria-label="${escapeHtml(`${entryLabel(entry)}, ${t("entries:page")} ${pageLabel(entry.page, getSpread(entry.spreadId))}`)}">${cells}</button></li>`;
  }

  /** After the delay, every name cut off by its line scrolls once (#287) */
  private scheduleMarquee() {
    window.clearTimeout(this.marqueeTimer);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    this.marqueeTimer = window.setTimeout(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      this.shadowRoot?.querySelectorAll<HTMLElement>(".row .label").forEach(label => {
        const overflow = label.scrollWidth - label.clientWidth;
        if (overflow <= 1) return;
        // There and back at the same speed: 70 % of the animation moves, the pauses take the rest (keyframes)
        const seconds = (2 * overflow) / rem / MARQUEE_SPEED_REM / 0.7;
        label.style.setProperty("--marquee-shift", `${-overflow}px`);
        label.style.setProperty("--marquee-duration", `${seconds.toFixed(2)}s`);
        label.classList.add("scrolling");
      });
    }, MARQUEE_DELAY_MS);
  }

  private handleMarqueeEnd = (event: Event) => {
    (event.target as HTMLElement).closest(".label")?.classList.remove("scrolling");
  };

  private handleClick = (event: Event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("button[data-entry]");
    if (el?.dataset.entry) this.game.router.navigate("/entry", { key: "entryId", value: el.dataset.entry });
  };
}

customElements.define("entries-list", EntriesList);
