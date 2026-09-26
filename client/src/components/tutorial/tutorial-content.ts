import { getTutorial } from "@/utils/game-config";
import { ITutorialContent } from "@/types";
import { escapeHtml, paragraphs } from "@/utils";
import { MARK_IMAGE_SRC } from "@/components/header";
import "@/components/common";
import { adoptDesignStyles } from "@/styles";
import i18next from "i18next";

const tutorial = getTutorial();

/** `*emphasis*` → <em> (the book title in step 3), after escaping */
const inline = (text: string): string => escapeHtml(text).replace(/\*([^*]+)\*/g, "<em>$1</em>");

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

    const fade = step.fadeIn ? `animation: fade-in ${step.fadeIn}ms ease both;` : "";
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
        .fade { ${fade} }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .fade { animation: none; } }
        img.mark { width: var(--mark-width); height: var(--mark-height); object-fit: contain; margin-bottom: 1.5rem; }
        /* Same layout as the camera screen: illustration above the text */
        gold-illustration { width: 5.5rem; margin: .5rem 0 1.5rem; }
        h1 { font-size: inherit; font-weight: 400; margin: 0 0 1.25rem; }
        /* Text block ≈ 247 px wide = the gradient box of the PDF (DESIGN.md §1) */
        .text { width: min(15.5rem, 100%); }
        p { margin: 0 0 1.25em; }
        .footer { margin-top: auto; padding-bottom: 1rem; }
      </style>
      <div class="head">
        <img class="mark" src="${MARK_IMAGE_SRC}" alt="${i18next.t("common:markAlt")}">
        ${step.illustration ? `<gold-illustration class="fade" src="${escapeHtml(step.illustration)}"></gold-illustration>` : ""}
        ${step.title ? `<h1 class="design gold text">${inline(step.title)}</h1>` : ""}
        ${step.description ? `<div class="text design gold fade">${paragraphs(step.description).map(p => `<p>${inline(p)}</p>`).join("")}</div>` : ""}
      </div>
      <slot name="actions"></slot>
      ${step.footer ? `<div class="footer design gold fade">${inline(step.footer)}</div>` : ""}
    `;
  }
}

customElements.define("tutorial-content", TutorialContent);
