import { PageMinimal } from "./page-minimal";
import { adoptDesignStyles } from "@/styles/design-styles";

/**
 * Base of the consultation mode pages (entries list, entry, info – design p.15–34): dark, slightly
 * transparent full-screen page below the top chrome (Mark, counter, "Entries", "i" in `header.ts`).
 * Subclasses provide `styles` and `template` and re-render through `update()`.
 */
export abstract class ConsultationPage extends PageMinimal {
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    adoptDesignStyles(this.shadowRoot);
  }

  /** Page frame only – colors, type and controls come from the tokens + shared primitives */
  public get baseStyles(): string {
    return /* css */ `
      :host {
        position: fixed;
        inset: 0;
        z-index: var(--page-z-index, 1000);
        overflow-y: auto;
        overscroll-behavior: contain;
        pointer-events: all;
        background: var(--consultation-background);
        color: var(--color-on-dark);
        font-family: var(--font-design);
        letter-spacing: var(--tracking-design);
        font-size: var(--text-size);
        line-height: var(--text-line);
        opacity: 0;
        visibility: hidden;
        transition: opacity .25s ease, visibility .25s;
      }
      :host([active=true]) {
        opacity: 1;
        visibility: visible;
      }
      .content {
        box-sizing: border-box;
        max-width: 36rem;
        margin: 0 auto;
        padding: var(--consultation-top) 1.25rem calc(3rem + env(safe-area-inset-bottom));
      }
      p { margin: 0 0 1em; white-space: pre-line; }
      a { color: var(--color-accent); }
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    // Re-render on route (param) and progress changes
    const game = this.game;
    const onChange = () => this.update();
    const cleanups = [game.subscribeToProperty("currentRoute", onChange), game.subscribeToProperty("progress", onChange)];
    this.unsubscribe = () => cleanups.forEach(c => c());
    this.update();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Route param of this page, if the current route is this page */
  protected routeParam(page: string): string | null {
    const route = this.game.state.currentRoute;
    return route?.page === page && route.param ? String(route.param.value) : null;
  }

  protected abstract update(): void;
}
