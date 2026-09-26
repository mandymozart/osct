import { GameStoreService } from "@/services";
import { IGame } from "@/types";
import { adoptDesignStyles } from "@/styles";

/**
 * Base of the settings sections on the Info page (Tilman 2026-09-26: "styled a little bit like a mobile
 * app"): a button or label, a short description below, a rule between the sections. Tools, settings and
 * later account settings each get their own section component.
 */
export abstract class SettingsSection extends HTMLElement {
  protected game: Readonly<IGame>;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  connectedCallback() {
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.render();
  }

  disconnectedCallback() {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
  }

  /** Markup of the section (inside the shared frame) */
  protected abstract content(): string;

  /** Click on an element with `data-action` inside the section */
  protected abstract onAction(action: string, element: HTMLElement): void;

  protected render(): void {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          display: block;
          padding: 1rem 0;
          border-bottom: var(--rule);
        }
        .row { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem .75rem; }
        .description { margin: .6rem 0 0; color: var(--color-muted); font-size: var(--text-size-small); }
        .options { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
        .options [aria-current="true"] { box-shadow: var(--shadow-bronze); }
      </style>
      ${this.content()}
    `;
  }

  private handleClick = (event: Event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (element?.dataset.action) this.onAction(element.dataset.action, element);
  };
}
