import { getBook } from "@/utils/game-config";
import { escapeHtml } from "@/components/consultation/entries-model";
import { MARK_IMAGE_SRC } from "@/components/header/mark-the-page";
import { PageMinimal } from "./page-minimal";
import { adoptDesignStyles } from "@/styles/design-styles";

/**
 * Home (IDLE): styled like the onboarding splash (design p.1) – Mark, title, author, and two buttons
 * in the onboarding style: "Start" (scan mode) and "Tutorial" (onboarding). A first visit goes to the
 * onboarding directly (`main.ts`); returning readers land here.
 */
export class HomePage extends PageMinimal {
  public get styles(): string {
    return /* css */ `
    :host {
      position: fixed;
      inset: 0;
      transform: none;
      background: var(--onboarding-background);
      pointer-events: all;
    }
    .content {
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      padding-top: max(11vh, 5.5rem);   /* Mark 88 px from the top, as the onboarding */
      box-sizing: border-box;
      text-align: center;
    }
    img { width: var(--mark-width); height: var(--mark-height); object-fit: contain; margin-bottom: 1.5rem; }
    h1 { font-size: inherit; font-weight: 400; margin: 0; }
    .title { width: min(15.5rem, 100%); }
    .author { margin-top: 1.25rem; }
    .buttons {
      position: absolute;
      top: 58%;
      left: 0;
      right: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.25rem;
    }
    `;
  }

  public get template(): string {
    const book = getBook();
    return /* html */ `
    <div class="content">
      <img src="${MARK_IMAGE_SRC}" alt="Mark the Page">
      <h1 class="title design gold">${escapeHtml(book.title)}</h1>
      <div class="author title design gold">${escapeHtml(book.author)}</div>
      <div class="buttons">
        <button type="button" class="button design" id="start-btn"><span class="gold">Start</span></button>
        <button type="button" class="button design" id="tutorial-btn"><span class="gold">Tutorial</span></button>
      </div>
    </div>
    `;
  }

  constructor() {
    super();
    adoptDesignStyles(this.shadowRoot);
    this.handleStart = this.handleStart.bind(this);
    this.handleTutorial = this.handleTutorial.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.setupListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeListeners();
  }

  private setupListeners() {
    this.shadowRoot?.querySelector("#start-btn")?.addEventListener("click", this.handleStart);
    this.shadowRoot?.querySelector("#tutorial-btn")?.addEventListener("click", this.handleTutorial);
  }

  private removeListeners() {
    this.shadowRoot?.querySelector("#start-btn")?.removeEventListener("click", this.handleStart);
    this.shadowRoot?.querySelector("#tutorial-btn")?.removeEventListener("click", this.handleTutorial);
  }

  private handleStart() {
    this.game.router.close();
  }

  private handleTutorial() {
    this.game.router.navigate("/tutorial", { key: "step", value: "0" });
  }
}

customElements.define("home-page", HomePage);
