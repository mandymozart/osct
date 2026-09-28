import { getBook, getTutorial } from "@/utils/game-config";
import { ITutorialContent } from "@/types";
import { escapeHtml, paragraphs } from "@/utils";
import { MARK_IMAGE_SRC } from "@/components/header";
import "@/components/common";
import { adoptDesignStyles } from "@/styles";
import { t } from "i18next";

const tutorial = getTutorial();

/** Default fade duration per part and delay between consecutive parts; a step can override both */
const DEFAULT_FADE_MS = 600;
const DEFAULT_STAGGER_MS = 250;

/**
 * Replaces `{{title}}`, `{{author}}` and `{{publisher}}` in step texts with the values from `book.yaml`.
 * Unknown placeholders are left unchanged.
 */
export const fillBookFields = (text: string, book: Record<string, string | undefined> = getBook() as unknown as Record<string, string | undefined>): string =>
  text.replace(/\{\{(title|author|publisher)\}\}/g, (_, field: string) => book[field] ?? "").trim();

/** Fills book fields, escapes, then turns `*emphasis*` into <em> */
const inline = (text: string): string => escapeHtml(fillBookFields(text)).replace(/\*([^*]+)\*/g, "<em>$1</em>");

/**
 * Onboarding step content from `content/steps`: Mark, optional illustration, title, text and footer, plus an
 * `actions` slot for the step button. Parts fade in one after another (`fadeIn` / `stagger` per step); the
 * resulting timing is exposed as `--fade-duration` / `--actions-delay` for the slotted button.
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
    const step = tutorial.find(s => s.index === this._currentStep);
    if (!step) return;

    // Fade sequence: Mark (only on steps that set `stagger`, i.e. the splash; otherwise it stays still),
    // illustration, title, text, footer; the slotted button follows after the last part
    const duration = step.fadeIn ?? DEFAULT_FADE_MS;
    const stagger = step.stagger ?? DEFAULT_STAGGER_MS;
    let slot = 0;
    /** Style attribute with the animation delay of the next part in the sequence */
    const next = () => `style="animation-delay: ${slot++ * stagger}ms"`;
    const mark = step.stagger !== undefined ? next() : null;
    const illustration = step.illustration ? next() : null;
    const title = step.title ? next() : null;
    const text = step.description ? next() : null;
    const footer = step.footer && fillBookFields(step.footer) ? next() : null;
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
        }
        /* At least --actions-top tall (set by the page): the actions start there for short texts and follow longer ones */
        .head {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          min-height: var(--actions-top, 0);
          padding-bottom: 1.5rem;
          box-sizing: border-box;
        }
        ::slotted([slot="actions"]) { width: 100%; }
        .fade { animation: fade-in ${duration}ms ease both; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .fade { animation: none; } }
        img[data-mark] { width: var(--mark-width); height: var(--mark-height); object-fit: contain; margin-bottom: 1.5rem; }
        gold-illustration { width: 5.5rem; margin: .5rem 0 1.5rem; }
        h1 { font-size: inherit; font-weight: 400; margin: 0 0 1.25rem; }
        .text { width: min(15.5rem, 100%); }
        p { margin: 0 0 1.25em; }
        .footer { padding-bottom: 1rem; }
      </style>
      <div class="head">
        <img class="${mark ? "fade" : ""}" ${mark ?? ""} src="${MARK_IMAGE_SRC}" alt="${t("common:markAlt")}" data-mark>
        ${illustration ? `<gold-illustration class="fade" ${illustration} src="${escapeHtml(step.illustration!)}"></gold-illustration>` : ""}
        ${title ? `<h1 class="design gold text fade" ${title}>${inline(step.title!)}</h1>` : ""}
        ${text ? `<div class="text design gold fade" ${text}>${paragraphs(step.description!).map(p => `<p>${inline(p)}</p>`).join("")}</div>` : ""}
      </div>
      <slot name="actions"></slot>
      ${footer ? `<div class="footer design gold fade" ${footer}>${inline(step.footer!)}</div>` : ""}
    `;
  }
}

customElements.define("tutorial-content", TutorialContent);
