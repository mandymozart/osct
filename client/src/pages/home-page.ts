import { getBook } from "@/utils/game-config";
import { escapeHtml } from "@/components/consultation/entries-model";
import { MARK_IMAGE_SRC } from "@/components/header/mark-the-page";
import { PageMinimal } from "./page-minimal";

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
      background: radial-gradient(ellipse at 50% 45%, #000 45%, #151515 100%);
      pointer-events: all;
    }
    .content {
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      padding-top: max(22vh, 6rem);
      box-sizing: border-box;
      font-family: var(--font-design);
      letter-spacing: var(--tracking-design);
      color: var(--color-accent);
      font-size: .85rem;
      text-align: center;
    }
    img { height: 4.5rem; margin-bottom: 1.5rem; }
    h1 { font-size: inherit; font-weight: 400; margin: 0; }
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
    button {
      min-width: 8rem;
      padding: .45rem 1.5rem;
      border: none;
      border-radius: 999px;
      background: #000;
      color: var(--color-accent);
      font: inherit;
      letter-spacing: inherit;
      box-shadow: 0 0 .9rem rgba(255, 255, 255, .55);
      cursor: pointer;
    }
    button.secondary { box-shadow: 0 0 .5rem rgba(255, 255, 255, .25); }
    `;
  }

  public get template(): string {
    const book = getBook();
    return /* html */ `
    <div class="content">
      <img src="${MARK_IMAGE_SRC}" alt="Mark the Page">
      <h1>${escapeHtml(book.title)}</h1>
      <div class="author">${escapeHtml(book.author)}</div>
      <div class="buttons">
        <button type="button" id="start-btn">Start</button>
        <button type="button" class="secondary" id="tutorial-btn">Tutorial</button>
      </div>
    </div>
    `;
  }

  constructor() {
    super();
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
