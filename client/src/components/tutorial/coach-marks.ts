import { GameStoreService } from "@/services";
import { GameMode, Pages, type IGame } from "@/types";
import { escapeHtml, paragraphs } from "@/utils";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";
import { t } from "i18next";

/** A coach mark: what its hole reveals, and the hole's shape */
export interface CoachMark {
  id: "scroller" | "icon";
  /** Path to the revealed element from the app's root, one selector per shadow root */
  target: readonly string[];
  shape: "pill" | "circle" | "ellipse";
}

/** A step's text and button, translated when shown (literal keys, so i18next-cli keeps them) */
const COACH_TEXTS: Record<CoachMark["id"], () => { text: string; button: string }> = {
  scroller: () => ({ text: t("tutorial:coach.scroller.text"), button: t("tutorial:coach.scroller.button") }),
  icon: () => ({ text: t("tutorial:coach.icon.text"), button: t("tutorial:coach.icon.button") }),
};

/** The two steps over the first scan (design p. 15–16): the page scroller at the bottom, then the icon at the top */
export const COACH_MARKS: readonly CoachMark[] = [
  { id: "scroller", target: ["spread-page", "spread-menu"], shape: "pill" },
  { id: "icon", target: ["game-header", "mark-the-page"], shape: "ellipse" },
];

export interface HoleRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The hole around a revealed element (screen pixels, measured at run time): the element's box grown by `pad` on
 * every side (a pill, or an ellipse in that box: the wide eye in the header, #297); a circle is the square around the
 * box's centre that holds the grown box's longer side. A missing or hidden element (no box) gives no hole – a zero box in the centre of the screen, so the veil covers everything.
 */
export const holeRect = (box: HoleRect | null, shape: CoachMark["shape"], pad: number, screen: { width: number; height: number }): HoleRect => {
  if (!box || box.width === 0 || box.height === 0) return { left: screen.width / 2, top: screen.height / 2, width: 0, height: 0 };
  if (shape !== "circle") return { left: box.left - pad, top: box.top - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };
  const size = Math.max(box.width, box.height) + 2 * pad;
  return { left: box.left + box.width / 2 - size / 2, top: box.top + box.height / 2 - size / 2, width: size, height: size };
};

/** Finds the element at the end of a path of selectors, stepping into each element's shadow root */
const findThroughShadows = (root: ParentNode, path: readonly string[]): HTMLElement | null => {
  let scope: ParentNode | null = root;
  let element: HTMLElement | null = null;
  for (const selector of path) {
    element = scope?.querySelector<HTMLElement>(selector) ?? null;
    scope = element?.shadowRoot ?? null;
    if (!element) return null;
  }
  return element;
};

/**
 * Coach marks over the live scan (#282, design p. 15–16): the first scan after the onboarding (and after a replay from
 * Info) dims the scan view and walks the reader through two steps, each with a hole in the veil that reveals the
 * control its text talks about – the page scroller at the bottom (arrows nudge left and right: it scrolls), then the
 * icon at the top. "Ok, I get it" ends them; the progress record remembers it (`coached`, HistoryManager).
 *
 * An overlay only: it changes neither the mode nor the route (RULES #2) and never touches the AR scene (RULES #4); the
 * camera picture keeps running under the veil. It covers the scan view and its header and takes the taps, so nothing
 * underneath activates a spread while it shows. Shown in scan mode on the spread page only – it hides on every other
 * route and comes back on the next scan until it was finished. The hole follows its element on every frame while it
 * shows (page transitions, rotation, the text size). No motion with reduced motion.
 */
export class CoachMarks extends HTMLElement {
  private game: Readonly<IGame>;
  private unsubscribe: (() => void) | null = null;
  private step = 0;
  private frame: number | undefined;
  /** The hole's last geometry, so a frame writes only when it moved */
  private hole = "";

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
    this.handleClick = this.handleClick.bind(this);
    this.follow = this.follow.bind(this);
  }

  connectedCallback() {
    this.renderShell();
    this.shadowRoot?.addEventListener("click", this.handleClick);
    const cleanups = [
      this.game.subscribeToProperty("mode", () => this.update()),
      this.game.subscribeToProperty("currentRoute", () => this.update()),
      this.game.subscribeToProperty("progress", () => this.update()),
    ];
    this.unsubscribe = () => cleanups.forEach(c => c());
    this.update();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    this.stopFollowing();
  }

  /** Whether the coach marks show now: scan mode on the spread page, not yet seen */
  get active(): boolean {
    const state = this.game.state;
    return state.mode === GameMode.SCAN && state.currentRoute?.page === Pages.SPREAD && !state.progress.coached;
  }

  private update() {
    const active = this.active;
    if (active === !this.hidden) return;
    this.hidden = !active;
    if (active) {
      this.step = 0;
      this.renderStep();
      this.frame = requestAnimationFrame(this.follow);
    } else {
      this.stopFollowing();
    }
  }

  private stopFollowing() {
    if (this.frame !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.hole = "";
  }

  private renderShell() {
    if (!this.shadowRoot) return;
    this.hidden = true;
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        /* Above the header (1100), below the update notice (1200) and the camera notice (2000) */
        :host {
          position: fixed;
          inset: 0;
          z-index: 1150;
          pointer-events: all;
          --text-line: var(--text-line-loose);
        }
        :host([hidden]) { display: none; }
        /* The veil is the hole's shadow: everything outside the hole is dimmed, the hole shows the scan view */
        .hole {
          position: fixed;
          box-shadow: 0 0 0 200vmax var(--coach-veil);
          border-radius: 1.5rem;
          transition: left 400ms ease, top 400ms ease, width 400ms ease, height 400ms ease, border-radius 400ms ease;
        }
        :host([step="icon"]) .hole { border-radius: 50%; }   /* an ellipse round the eye */
        /* The scroller scrolls: an arrow at each end of the hole nudges outwards */
        .nudge {
          position: fixed;
          display: none;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.25rem 0;   /* level with the scroller's items, below its label */
          box-sizing: border-box;
          pointer-events: none;
        }
        :host([step="scroller"]) .nudge { display: flex; }
        .nudge span { animation: nudge-left 1.6s ease-in-out infinite; }
        .nudge span + span { animation-name: nudge-right; }
        @keyframes nudge-left { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-0.5rem); } }
        @keyframes nudge-right { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(0.5rem); } }
        /* On the onboarding's grid (DESIGN.md §3a): the text from the top of row 3, the button from row 5 */
        .content {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: var(--grid-top) 1.5rem var(--grid-bottom);
        }
        .text {
          width: min(15.5rem, 100%);
          margin-top: calc(2 * var(--grid-row));
          min-height: calc(2 * var(--grid-row));
          padding-bottom: 1.5rem;
          box-sizing: border-box;
        }
        p { margin: 0 0 1.25em; }
        @media (prefers-reduced-motion: reduce) {
          .hole { transition: none; }
          .nudge span { animation: none; }
        }
      </style>
      <div class="hole"></div>
      <div class="nudge" aria-hidden="true"><span class="design gold">←</span><span class="design gold">→</span></div>
      <div class="content" role="dialog" aria-modal="true" aria-label="${escapeHtml(t("tutorial:coach.dialog"))}" aria-describedby="text">
        <div class="text design gold" id="text"></div>
        <div class="actions"></div>
      </div>
    `;
  }

  private get mark(): CoachMark {
    return COACH_MARKS[this.step];
  }

  private renderStep() {
    const root = this.shadowRoot;
    const text = root?.querySelector(".text");
    const actions = root?.querySelector(".actions");
    if (!text || !actions) return;
    const id = this.mark.id;
    const texts = COACH_TEXTS[id]();
    this.setAttribute("step", id);
    text.innerHTML = paragraphs(texts.text).map(p => `<p>${escapeHtml(p)}</p>`).join("");
    actions.innerHTML = goldButton({ label: texts.button, shape: "button", primary: true });
    actions.querySelector("button")?.focus({ preventScroll: true });
  }

  /** Keeps the hole (and the arrows) on the revealed element while the coach marks show */
  private follow() {
    // Stopped, taken out of the page, or a frame that fires after the window went away (a test's teardown)
    if (this.frame === undefined || !this.isConnected || typeof requestAnimationFrame !== "function") return;
    this.frame = requestAnimationFrame(this.follow);
    const root = this.getRootNode() as ParentNode;
    const element = findThroughShadows(root, this.mark.target);
    const box = element && !element.hidden ? element.getBoundingClientRect() : null;
    const pad = parseFloat(getComputedStyle(document.documentElement).fontSize) / 2; // .5rem
    const rect = holeRect(box, this.mark.shape, pad, { width: window.innerWidth, height: window.innerHeight });
    const geometry = `${rect.left},${rect.top},${rect.width},${rect.height}`;
    if (geometry === this.hole) return;
    this.hole = geometry;
    // Measured screen geometry, set at run time
    this.shadowRoot?.querySelectorAll<HTMLElement>(".hole, .nudge").forEach(part => {
      Object.assign(part.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    });
  }

  private handleClick(event: Event) {
    if (!(event.target as HTMLElement).closest("button")) return;
    if (this.step < COACH_MARKS.length - 1) {
      this.step += 1;
      this.renderStep();
    } else {
      this.game.history.setCoached(true);
    }
  }
}

customElements.define("coach-marks", CoachMarks);
