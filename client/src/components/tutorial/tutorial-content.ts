import { getExperience } from "@/utils/game-config";
import type { ITutorialContent } from "@/types";
import { escapeHtml, onboardingSteps, paragraphs } from "@/utils";
import { ONBOARDING_ICON_SRC, SPLASH_STEP, type SplashFields, splashFields } from "@/utils/static-splash-html";
import "@/components/common";
import { adoptDesignStyles } from "@/styles";

/**
 * Replaces `{{title}}`, `{{author}}` and `{{publisher}}` in step texts with the experience's values (the splash's
 * parts – the author and the publisher are its printed book's, "" without one). Unknown placeholders are left unchanged.
 */
export const fillExperienceFields = (text: string, fields: Partial<SplashFields> = splashFields(getExperience())): string =>
  text.replace(/\{\{(title|author|publisher)\}\}/g, (_, field: keyof SplashFields) => fields[field] ?? "").trim();

/** Fills the experience's fields, escapes, then turns `*emphasis*` into <em> */
const inline = (text: string): string => escapeHtml(fillExperienceFields(text)).replace(/\*([^*]+)\*/g, "<em>$1</em>");

/**
 * An onboarding step (`utils/onboarding.ts` – the app's own steps, not the experience's): the icon, optional illustration,
 * title, text and footer, plus an `actions` slot for the step button.
 *
 * No fade between the onboarding steps: a tap on the button shows the next one at once (design p. 8–14, #281). Only a
 * step with `fadeIn` fades – the splash: the icon and the title show at once, the text and the footer fade in together
 * after `fadeAfter`; the timing is exposed as `--fade-duration` / `--actions-delay` for a slotted button.
 *
 * Laid out on the vertical grid (`--grid-row`, six rows – DESIGN.md §3a, #295): the icon in row 1 (its centre at
 * `--onboarding-icon-centre` of the row), the illustration in row 2, title and text from the top of row 3, the button
 * (or the footer) from the top of row 5. A text longer than rows 3–4 pushes the button down. The host starts at the
 * top of the page area (the page pads the safe area). The splash's title shimmers (#280).
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
    const step = onboardingSteps(getExperience()).find(s => s.index === this._currentStep);
    if (!step) return;

    // Only the splash fades: its text and footer together, after the title has shown alone
    const duration = step.fadeIn ?? 0;
    const delay = step.fadeAfter ?? 0;
    const fades = duration > 0;
    /** Class and style of a part that fades in on the splash */
    const parts = (classes: string) => `class="${classes}${fades ? " fade" : ""}"${fades ? ` style="animation-delay: ${delay}ms"` : ""}`;
    const footer = step.footer && fillExperienceFields(step.footer) ? step.footer : undefined;
    this.style.setProperty("--fade-duration", `${duration}ms`);
    this.style.setProperty("--actions-delay", `${fades ? delay : 0}ms`);
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
        @media (prefers-reduced-motion: reduce) { .fade { animation: none; } }
        .icon-row { justify-content: flex-start; }
        img[data-icon] {
          width: var(--onboarding-icon-width);
          height: var(--onboarding-icon-height);
          margin-top: max(0px, calc(var(--grid-row) * var(--onboarding-icon-centre) - var(--onboarding-icon-height) / 2));
          object-fit: contain;
        }
        gold-illustration { width: 5.5rem; max-height: 100%; }
        h1 { font-size: inherit; font-weight: 400; margin: 0 0 1.25rem; }
        .text { width: min(15.5rem, 100%); }
        p { margin: 0 0 1.25em; }
        .footer { padding-bottom: 1rem; }
      </style>
      <div class="row icon-row">
        <img src="${ONBOARDING_ICON_SRC}" alt="" data-icon>
      </div>
      <div class="row illustration-row">
        ${step.illustration ? `<gold-illustration src="${escapeHtml(step.illustration)}"></gold-illustration>` : ""}
      </div>
      <div class="head">
        ${step.title ? `<h1 class="design gold ${step.id === SPLASH_STEP.id ? "shimmer " : ""}text">${inline(step.title)}</h1>` : ""}
        ${step.description ? `<div ${parts("text design gold")}>${paragraphs(step.description).map(p => `<p>${inline(p)}</p>`).join("")}</div>` : ""}
      </div>
      <slot name="actions"></slot>
      ${footer ? `<div ${parts("footer design gold")}>${inline(footer)}</div>` : ""}
    `;
  }
}

customElements.define("tutorial-content", TutorialContent);
