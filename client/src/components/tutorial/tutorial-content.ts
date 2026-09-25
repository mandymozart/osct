import { getTutorial } from "@/utils/game-config";
import { ITutorialContent } from "@/types/tutorial";
import { escapeHtml, paragraphs } from "@/components/consultation/entries-model";
import { MARK_IMAGE_SRC } from "@/components/header/mark-the-page";

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
          height: 100%;
          font-family: var(--font-design);
          letter-spacing: var(--tracking-design);
          color: var(--color-accent);
          font-size: .85rem;
          line-height: 1.35;
        }
        .step { display: contents; }
        .fade { ${fade} }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .fade { animation: none; } }
        img.mark { height: 4.5rem; margin-bottom: 1.5rem; }
        h1 { font-size: inherit; font-weight: 400; margin: 0 0 1.25rem; }
        .text { max-width: 16rem; }
        p { margin: 0 0 1.25em; }
        .footer { margin-top: auto; padding-bottom: 1rem; }
        .illustration { max-height: 6rem; margin: 1rem 0; }
      </style>
      <img class="mark" src="${MARK_IMAGE_SRC}" alt="Mark the Page">
      ${step.title ? `<h1>${inline(step.title)}</h1>` : ""}
      <div class="text fade">
        ${step.description ? paragraphs(step.description).map(p => `<p>${inline(p)}</p>`).join("") : ""}
        ${step.illustration ? `<img class="illustration" src="${escapeHtml(step.illustration)}" alt="">` : ""}
      </div>
      ${step.footer ? `<div class="footer fade">${inline(step.footer)}</div>` : ""}
    `;
  }
}

customElements.define("tutorial-content", TutorialContent);
