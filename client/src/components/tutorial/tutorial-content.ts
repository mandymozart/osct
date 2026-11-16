import { getBook } from "@/utils/game-config";
import type { ITutorialContent } from "@/types";
import { escapeHtml, onboardingSteps, paragraphs } from "@/utils";
import { SPLASH_STEP } from "@/utils/static-splash-html";
import { MARK_IMAGE_SRC } from "@/components/header";
import "@/components/common";
import { adoptDesignStyles } from "@/styles";
import { t } from "i18next";


/** Default fade duration per part and delay between consecutive parts; a step can override both */
const DEFAULT_FADE_MS = 600;
const DEFAULT_STAGGER_MS = 250;

/**
 * Replaces `{{title}}`, `{{author}}` and `{{publisher}}` in step texts with the book's values (the splash's parts).
 * Unknown placeholders are left unchanged.
 */
type BookField = "title" | "author" | "publisher";

export const fillBookFields = (text: string, book: Partial<Record<BookField, string>> = getBook()): string =>
  text.replace(/\{\{(title|author|publisher)\}\}/g, (_, field: BookField) => book[field] ?? "").trim();

/** Fills book fields, escapes, then turns `*emphasis*` into <em> */
const inline = (text: string): string => escapeHtml(fillBookFields(text)).replace(/\*([^*]+)\*/g, "<em>$1</em>");

/**
 * An onboarding step (`utils/onboarding.ts` – the app's own steps, not the book's): Mark, optional illustration, title, text and footer, plus an
 * `actions` slot for the step button. Parts fade in one after another (`fadeIn` / `stagger` per step); the
 * resulting timing is exposed as `--fade-duration` / `--actions-delay` for the slotted button.
 *
 * Laid out on the vertical grid (`--grid-row`, six rows – DESIGN.md §3a, #295): the Mark centred in row 1, the
 * illustration in row 2, title and text from the top of row 3, the button (or the footer) from the top of row 5.
 * A text longer than rows 3–4 pushes the button down. The host starts at the top of the page area (the page pads
 * the safe area). The splash's book title shimmers (#280).
 */
export class TutorialContent extends HTMLElement implements ITutorialContent {
  private _currentStep = 0;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  static get observedAttributes() {
    return ["current-step"];
  }

  get currentStep(): number {
    return this._currentStep;
  }

  set currentStep(value: number) {
    this.setAttribute("current-step", value.toString());
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name !== "current-step" || oldValue === newValue) return;
    this._currentStep = parseInt(newValue) || 0;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    if (!this.shadowRoot) return;
    const step = onboardingSteps(getBook()).find(s => s.index === this._currentStep);
    if (!step) return;

    // Fade sequence: Mark (only on steps that set `stagger`, i.e. the splash; otherwise it stays still),
    // illustration, title, text, footer; the slotted button follows after the last part
    const duration = step.fadeIn ?? DEFAULT_FADE_MS;
    const stagger = step.stagger ?? DEFAULT_STAGGER_MS;
    let slot = 0;
    /** Style attribute with the animation delay of the next part in the sequence */
    const next = () => `style="animation-delay: ${slot++ * stagger}ms"`;
    /** A part that is shown: its text and its place in the sequence */
    const part = (value: string | undefined, shown = !!value) => (value && shown ? { value, delay: next() } : null);
    const mark = step.stagger !== undefined ? next() : null;
    const illustration = part(step.illustration);
    const title = part(step.title);
    const text = part(step.description);
    const footer = part(step.footer, !!step.footer && !!fillBookFields(step.footer));
    this.style.setProperty("--fade-duration", `${duration}ms`);
    this.style.setProperty("--actions-delay", `${slot * stagger}ms`);
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          min-height: 100%;
          --text-line: var(--text-line-loose);
        }
        .row {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: var(--grid-row);
        }
        /* Rows 3-4: the actions start at row 5 for short texts and follow longer ones (1.5rem below them) */
        .head {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          min-height: calc(2 * var(--grid-row));
          padding-bottom: 1.5rem;
          box-sizing: border-box;
        }
        ::slotted([slot="actions"]) { width: 100%; }
        .fade { animation: fade-in ${duration}ms ease both; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        /* The shimmering title fades in too (both animations; the shared .gold.shimmer alone would drop the fade) */
        h1.fade.shimmer { animation: fade-in ${duration}ms ease both, gold-shimmer var(--shimmer-duration) ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .fade, h1.fade.shimmer { animation: none; } }
        img[data-mark] { width: var(--mark-width); height: var(--mark-height); object-fit: contain; }
        gold-illustration { width: 5.5rem; max-height: 100%; }
        h1 { font-size: inherit; font-weight: 400; margin: 0 0 1.25rem; }
        .text { width: min(15.5rem, 100%); }
        p { margin: 0 0 1.25em; }
        .footer { padding-bottom: 1rem; }
      </style>
      <div class="row mark-row">
        <img class="${mark ? "fade" : ""}" ${mark ?? ""} src="${MARK_IMAGE_SRC}" alt="${t("common:markAlt")}" data-mark>
      </div>
      <div class="row illustration-row">
        ${illustration ? `<gold-illustration class="fade" ${illustration.delay} src="${escapeHtml(illustration.value)}"></gold-illustration>` : ""}
      </div>
      <div class="head">
        ${title ? `<h1 class="design gold ${step.id === SPLASH_STEP.id ? "shimmer " : ""}text fade" ${title.delay}>${inline(title.value)}</h1>` : ""}
        ${text ? `<div class="text design gold fade" ${text.delay}>${paragraphs(text.value).map(p => `<p>${inline(p)}</p>`).join("")}</div>` : ""}
      </div>
      <slot name="actions"></slot>
      ${footer ? `<div class="footer design gold fade" ${footer.delay}>${inline(footer.value)}</div>` : ""}
    `;
  }
}

customElements.define("tutorial-content", TutorialContent);
