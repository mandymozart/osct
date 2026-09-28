import { GameStoreService } from "@/services";
import { IGame } from "@/types";
import { adoptDesignStyles } from "@/styles";

/**
 * Base class for the Info page's settings sections: shadow root with design styles, shared section frame
 * (padding, separator rule, `.row` / `.description` / `.options` styles) and click delegation to
 * `onAction` for elements with `data-action`. Subclasses provide `content()`.
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

  /** Section markup, rendered inside the shared frame */
  protected abstract content(): string;

  /** Handles a click on an element with `data-action` inside the section */
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
        /* First section of a group sits directly below the group title */
        :host(:first-child) { padding-top: 0; }
        /* Last section of a group has no rule: the next group's title draws its own */
        :host(:last-child) { border-bottom: none; }
        .row { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem .75rem; }
        .description { margin: .6rem 0 0; color: var(--color-muted); font-size: var(--text-size-small); }
        .description.first { margin-top: 0; }
        .options { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
        :host .options [aria-current="true"] { box-shadow: var(--shadow-bronze), inset 0 0 0 0.0625rem var(--color-accent); }
      </style>
      ${this.content()}
    `;
  }

  private handleClick = (event: Event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (element?.dataset.action) this.onAction(element.dataset.action, element);
  };
}
