import { PageMinimal } from "./page-minimal";

/**
 * Base of the consultation mode pages (entries list, entry, info – design p.15–34): dark, slightly
 * transparent full-screen page below the top chrome (Mark, counter, "Entries", "i" in `header.ts`).
 * Subclasses provide `styles` and `template` and re-render through `update()`.
 */
export abstract class ConsultationPage extends PageMinimal {
  private unsubscribe: (() => void) | null = null;

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
        color: var(--consultation-text);
        font-family: var(--font-design);
        letter-spacing: var(--tracking-design);
        font-size: .9rem;
        line-height: 1.35;
        opacity: 0;
        visibility: hidden;
        transition: opacity .25s ease, visibility .25s;
        -webkit-backdrop-filter: blur(2px);
        backdrop-filter: blur(2px);
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
      button { font: inherit; letter-spacing: inherit; }
      .pill {
        border: none;
        border-radius: 999px;
        padding: .45rem 1rem;
        color: var(--color-accent);
        background: var(--consultation-pill);
        box-shadow: var(--glass-shadow);
        cursor: pointer;
      }
      .rule-table {
        width: 100%;
        border-collapse: collapse;
        font-size: .8rem;
      }
      .rule-table th,
      .rule-table td {
        text-align: left;
        font-weight: 400;
        padding: .2rem 0;
        border-top: 1px solid var(--consultation-rule);
        border-bottom: 1px solid var(--consultation-rule);
        vertical-align: top;
      }
      .rule-table th { color: var(--consultation-muted); width: 40%; }
      .section-title {
        margin: 1.5rem 0 1rem;
        padding: .15rem 0;
        font-size: .8rem;
        font-weight: 400;
        color: var(--consultation-muted);
        border-top: 1px solid var(--consultation-rule);
        border-bottom: 1px solid var(--consultation-rule);
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
