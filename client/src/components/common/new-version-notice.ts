import { GameStoreService, UpdateService } from "@/services";
import { type IGame, Pages } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";
import { t } from "i18next";
import { showNewVersionNotice } from "./new-version";

/**
 * <new-version-notice>: a short glass notice at the foot of the screen when the page runs out-of-date code – a new
 * version took over, or a code file could not be loaded (`UpdateService`) – with *Reload* and a cross (*Later*). It
 * shows only at a calm moment (`new-version.ts`): hidden while the camera or AR runs, it comes back once the reader
 * leaves the scan. It never reloads by itself. *Later* hides it until a code file fails to load again or another
 * version takes over. In the scan view (AR failed) it sits above the spread menu.
 */
export class NewVersionNotice extends HTMLElement {
  private game: Readonly<IGame>;
  private updates = UpdateService.getInstance();
  private cleanups: Array<() => void> = [];
  private dismissed = false;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  connectedCallback() {
    this.render();
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.cleanups.push(
      this.updates.subscribe(() => {
        this.dismissed = false;
        this.update();
      }),
      this.game.subscribeToProperty("currentRoute", () => this.update()),
      this.game.subscribeToProperty("arStatus", () => this.update()),
    );
    this.update();
  }

  disconnectedCallback() {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
  }

  private handleClick = (event: Event) => {
    const action = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "reload") this.updates.reload();
    else if (action === "later") {
      this.dismissed = true;
      this.update();
    }
  };

  private update() {
    const page = this.game.state.currentRoute?.page ?? null;
    const shown = showNewVersionNotice({ outdated: this.updates.isOutdated, dismissed: this.dismissed, page, arStatus: this.game.state.arStatus });
    this.toggleAttribute("shown", shown);
    this.toggleAttribute("scan", page === Pages.SPREAD);
    this.shadowRoot?.querySelector(".notice")?.toggleAttribute("hidden", !shown);
  }

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          position: fixed;
          left: 0;
          right: 0;
          bottom: max(1rem, env(safe-area-inset-bottom));
          z-index: 1200;
          display: flex;
          justify-content: center;
          padding: 0 1rem;
          pointer-events: none;
        }
        :host([scan]) { bottom: calc(max(1rem, env(safe-area-inset-bottom)) + 4.5rem); }
        .notice {
          display: flex;
          align-items: center;
          gap: .75rem;
          max-width: 22rem;
          padding: .6rem .6rem .6rem 1.1rem;
          border-radius: 1.45rem;
          background: var(--consultation-background);
          -webkit-backdrop-filter: var(--glass-blur);
          backdrop-filter: var(--glass-blur);
          box-shadow: var(--shadow-bronze);
          color: var(--color-on-dark);
          pointer-events: auto;
        }
        .notice[hidden] { display: none; }
        .text { flex: 1 1 auto; }
        .actions { display: flex; align-items: center; gap: .5rem; flex: none; }
      </style>
      <div class="notice" role="status" aria-live="polite" hidden>
        <span class="text design">${t("update:ready")}</span>
        <span class="actions">
          ${goldButton({ label: t("update:reload"), primary: true, attrs: { "data-action": "reload" } })}
          ${goldButton({ label: "×", shape: "icon", attrs: { "data-action": "later", "aria-label": t("update:later"), title: t("update:later") } })}
        </span>
      </div>
    `;
  }
}

customElements.define("new-version-notice", NewVersionNotice);
