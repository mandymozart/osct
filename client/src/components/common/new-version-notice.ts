import { GameStoreService, UpdateService } from "@/services";
import { type IGame, Pages } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";
import { getConfigVersion, getSkippedFeatures } from "@/utils/game-config";
import { t } from "i18next";
import { type NoticeMessage, noticeMessage } from "./new-version";

/** Where the reader's device keeps the book version whose newer-features hint it has shown */
export const NEWER_CONTENT_SEEN_KEY = "osct-newer-content-seen";

/**
 * <new-version-notice>: a short glass notice at the foot of the screen when the page runs out-of-date code – a new
 * version took over, or a code file could not be loaded (`UpdateService`) – with *Reload* and a cross (*Later*). It
 * shows only at a calm moment (`new-version.ts`): hidden while the camera or AR runs, it comes back once the reader
 * leaves the scan. It never reloads by itself. *Later* hides it until a code file fails to load again or another
 * version takes over. In the scan view (AR failed) it sits above the spread menu.
 *
 * When the book uses features this app version does not know (`getSkippedFeatures()`, RULES #10) it first says so,
 * once per book version: shown once, the version is remembered on the device, and the cross closes the hint for the
 * session. *Reload* stays while a new version is ready too.
 */
export class NewVersionNotice extends HTMLElement {
  private game: Readonly<IGame>;
  private updates = UpdateService.getInstance();
  private cleanups: Array<() => void> = [];
  private dismissed = false;
  /** The book has skipped features and its hint is still to show (not seen on this device, not closed) */
  private newerContent = false;
  private message: NoticeMessage | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  connectedCallback() {
    this.newerContent = getSkippedFeatures().length > 0 && readSeen() !== bookVersion();
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
      if (this.message === "newer-content") this.newerContent = false;
      else this.dismissed = true;
      this.update();
    }
  };

  private update() {
    const page = this.game.state.currentRoute?.page ?? null;
    const message = noticeMessage({
      outdated: this.updates.isOutdated, dismissed: this.dismissed, newerContent: this.newerContent, page, arStatus: this.game.state.arStatus,
    });
    // Shown once per book version: the device remembers it the first time the hint shows
    if (message === "newer-content" && this.message !== "newer-content") writeSeen(bookVersion());
    this.message = message;
    this.toggleAttribute("shown", !!message);
    this.toggleAttribute("scan", page === Pages.SPREAD);
    const root = this.shadowRoot;
    root?.querySelector(".notice")?.toggleAttribute("hidden", !message);
    const text = root?.querySelector(".text");
    if (text && message) text.textContent = message === "newer-content" ? t("update:newerContent") : t("update:ready");
    root?.querySelector('[data-action="reload"]')?.toggleAttribute("hidden", !this.updates.isOutdated);
    const close = root?.querySelector('[data-action="later"]');
    const label = message === "newer-content" ? t("update:close") : t("update:later");
    close?.setAttribute("aria-label", label);
    close?.setAttribute("title", label);
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
        :host [hidden] { display: none; }
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

/** The loaded book's version: its build checksum, else its schema */
const bookVersion = (): string => {
  const version = getConfigVersion();
  return version.hash || version.schema;
};

const readSeen = (): string | null => {
  try {
    return localStorage.getItem(NEWER_CONTENT_SEEN_KEY);
  } catch {
    return null;
  }
};

const writeSeen = (version: string): void => {
  try {
    localStorage.setItem(NEWER_CONTENT_SEEN_KEY, version);
  } catch {
    // Blocked storage: the hint shows again next time
  }
};

customElements.define("new-version-notice", NewVersionNotice);
