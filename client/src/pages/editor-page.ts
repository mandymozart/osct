import { PageMinimal } from "./page-minimal";
import { Pages } from "@/types";
import { setPreviewActive } from "@/components/ar-bridges";

/** Routes that end the editor session (the reader's own views); consultation overlays keep the preview */
const LEAVES_EDITOR = new Set<Pages>([Pages.SPREAD, Pages.SPLASH, Pages.TUTORIAL]);
/** A debug tune panel left open by the overlay is closed when the editor opens or goes (the sheet hosts the inspector) */
const DEBUG_PANELS_SELECTOR = "tune-panel";

/**
 * The editor page (`/editor`, scan mode): transparent over the AR scene like the spread page, but the scene runs
 * over the mock stage instead of the camera (the preview, `ar-bridges/utils/preview.ts`). The editor's own UI – one
 * sheet at the bottom with the spread switch and the tabs Stage / Entity – is a chunk of its own (`src/editor/`),
 * loaded the first time the page opens, so readers never download it. Opening the page switches the preview on; the reader's scan
 * view, the start page or the tutorial switch it off (an entry opened from the editor does not).
 */
export class EditorPage extends PageMinimal {
  private loaded = false;
  private loading: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;

  get styles(): string {
    return /* css */ `
      :host {
        position: fixed;
        inset: 0;
        background: none;
        border-radius: 0;
        transform: none;
        pointer-events: none;
      }
      .loading {
        position: fixed;
        top: calc(var(--debug-offset, 0px) + env(safe-area-inset-top) + 3.5rem);
        left: 50%;
        transform: translateX(-50%);
        padding: .25rem .75rem;
        border-radius: .25rem;
        background: rgba(0, 0, 0, .7);
        color: #0f0;
        font: .75rem/1.25rem monospace;
      }
    `;
  }

  get template(): string {
    return this.loaded ? /* html */ `<editor-sheet></editor-sheet>` : /* html */ `<div class="loading">Loading the editor…</div>`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = this.game.subscribeToProperty("currentRoute", route => {
      if (route && LEAVES_EDITOR.has(route.page)) setPreviewActive(false);
    });
    if (this.active) this.open();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribe = null;
    setPreviewActive(false);
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name !== "active" || !this.isConnected) return;
    if (newValue === "true") this.open();
    else document.querySelectorAll(DEBUG_PANELS_SELECTOR).forEach(panel => panel.remove());
  }

  /** The preview on, the editor chunk loaded once */
  private open(): void {
    setPreviewActive(true);
    document.querySelectorAll(DEBUG_PANELS_SELECTOR).forEach(panel => panel.remove());
    if (this.loaded || this.loading) return;
    this.loading = import("@/editor")
      .then(editor => {
        editor.defineEditor();
        this.loaded = true;
        this.render();
      })
      .catch(error => {
        console.error("[EditorPage] The editor could not be loaded:", error);
        const notice = this.shadowRoot?.querySelector(".loading");
        if (notice) notice.textContent = "The editor could not be loaded – reload to try again";
      })
      .finally(() => (this.loading = null));
  }
}

customElements.define("editor-page", EditorPage);
