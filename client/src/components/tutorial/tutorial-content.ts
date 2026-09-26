import { getBook, getTutorial } from "@/utils/game-config";
import { ITutorialContent } from "@/types";
import { escapeHtml, paragraphs } from "@/utils";
import { MARK_IMAGE_SRC } from "@/components/header";
import "@/components/common";
import { adoptDesignStyles } from "@/styles";
import i18next from "i18next";

const tutorial = getTutorial();

/** Every step fades in (Tilman 2026-09-26): its parts one after the other – smooth, "flowy" */
const DEFAULT_FADE_MS = 600;
const DEFAULT_STAGGER_MS = 250;

/**
 * Book fields in step texts: `{{title}}`, `{{author}}`, `{{publisher}}` → the values from `book.yaml`, so they
 * are written once (e.g. the splash footer = the publisher). Unknown placeholders stay as they are.
 */
export const fillBookFields = (text: string, book: Record<string, string | undefined> = getBook() as unknown as Record<string, string | undefined>): string =>
  text.replace(/\{\{(title|author|publisher)\}\}/g, (_, field: string) => book[field] ?? "").trim();

/** Book fields filled in, then `*emphasis*` → <em> (the book title in step 3), after escaping */
const inline = (text: string): string => escapeHtml(fillBookFields(text)).replace(/\*([^*]+)\*/g, "<em>$1</em>");

/**
 * Onboarding step content (design p.1–5): Mark, title, text, footer – from the step content
 * (`content/steps`). A step with `fadeIn` fades in (design: 1s on p.2); others appear directly (p.3).
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

    // Parts fade in one after the other: Mark (splash only – on later steps it stays still), illustration,
    // title, text, footer; the button (tutorial-navigation) follows after the last part
    const duration = step.fadeIn ?? DEFAULT_FADE_MS;
    const stagger = step.stagger ?? DEFAULT_STAGGER_MS;
    let slot = 0;
    /** The next part in the sequence: its delay (a style attribute) */
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
        /* Mark, illustration and text – at least as tall as --actions-top (set by the page), so the
           actions below start there for short texts and follow longer ones */
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
        /* Same layout as the camera screen: illustration above the text */
        gold-illustration { width: 5.5rem; margin: .5rem 0 1.5rem; }
        h1 { font-size: inherit; font-weight: 400; margin: 0 0 1.25rem; }
        /* Text block ≈ 247 px wide = the gradient box of the PDF (DESIGN.md §1) */
        .text { width: min(15.5rem, 100%); }
        p { margin: 0 0 1.25em; }
        /* Where the button would be (≈ 58 %, design p.2) – the splash has no button */
        .footer { padding-bottom: 1rem; }
      </style>
      <div class="head">
        <img class="${mark ? "fade" : ""}" ${mark ?? ""} src="${MARK_IMAGE_SRC}" alt="${i18next.t("common:markAlt")}" data-mark>
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
