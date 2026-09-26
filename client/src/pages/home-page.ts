import { getBook } from "@/utils/game-config";
import { escapeHtml } from "@/utils";
import { MARK_IMAGE_SRC } from "@/components/header";
import { PageMinimal } from "./page-minimal";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";
import i18next from "i18next";

/**
 * Home (IDLE): styled like the onboarding splash (design p.1) – Mark, title, author, and two buttons
 * in the onboarding style: "Start" (scan mode) and "Tutorial" (onboarding). The publisher (book content)
 * sits above "Start" in the title's style (Tilman 2026-09-26 – not in the design draft). A first visit goes to the
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
    /* Scrolls when the text doesn't fit (large text size) */
    .content {
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      overflow-y: auto;
      padding: max(11vh, 5.5rem) 1.5rem 1.5rem;   /* Mark 88 px from the top, as the onboarding */
      box-sizing: border-box;
      text-align: center;
    }
    /* Mark, title, author – at least down to 58 % of the screen, where the buttons start (design); the
       buttons follow in the flow, so a larger text pushes them down instead of overlapping (as the tutorial) */
    .head {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      min-height: calc(58vh - max(11vh, 5.5rem));
      flex-shrink: 0;   /* never squeezed below its text (the column scrolls instead) */
      padding-bottom: 1.5rem;
      box-sizing: border-box;
    }
    img { width: var(--mark-width); height: var(--mark-height); object-fit: contain; margin-bottom: 1.5rem; }
    h1 { font-size: inherit; font-weight: 400; margin: 0; }
    .title { width: min(15.5rem, 100%); }
    .author { margin-top: 1.25rem; }
    .publisher { margin-bottom: .5rem; }
    .buttons {
      flex-shrink: 0;
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
      <div class="head">
        <img src="${MARK_IMAGE_SRC}" alt="${i18next.t("common:markAlt")}">
        <h1 class="title design gold">${escapeHtml(book.title)}</h1>
        <div class="author title design gold">${escapeHtml(book.author)}</div>
      </div>
      <div class="buttons">
        ${book.publisher ? `<div class="publisher title design gold">${escapeHtml(book.publisher)}</div>` : ""}
        ${goldButton({ label: i18next.t("home:start"), shape: "button", primary: true, attrs: { id: "start-btn" } })}
        ${goldButton({ label: i18next.t("home:tutorial"), shape: "button", attrs: { id: "tutorial-btn" } })}
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
