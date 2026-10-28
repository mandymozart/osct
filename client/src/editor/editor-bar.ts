import { GameStoreService } from "@/services";
import { IGame } from "@/types";
import { getSpreads } from "@/utils/game-config";
import { EDITOR_OPENED_EVENT } from "@/pages";

/** The panels the bar opens (`<name>-panel`, bottom sheets), at most one at a time */
const PANELS = ["preview", "tune"] as const;
type PanelName = (typeof PANELS)[number];

/**
 * The editor's bar at the top of the page: ‹ › step through the spreads (the stage follows), **preview** opens the
 * preview panel (view, found targets, wobble, backdrop), **tune** the tune panel (placement and filters of an entity,
 * "Copy YAML"), **exit** returns to the reader's scan view. The preview panel opens with the editor.
 */
export class EditorBar extends HTMLElement {
  private shadow: ShadowRoot;
  private game: Readonly<IGame>;
  private cleanups: Array<() => void> = [];

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    this.shadow.addEventListener("click", this.onClick);
    this.addEventListener(EDITOR_OPENED_EVENT, this.onOpened);
    this.cleanups.push(this.game.subscribeToProperty("currentSpread", () => this.renderSpread()));
    this.onOpened();
  }

  disconnectedCallback() {
    this.shadow.removeEventListener("click", this.onClick);
    this.removeEventListener(EDITOR_OPENED_EVENT, this.onOpened);
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    document.querySelectorAll(PANELS.map(panel => `${panel}-panel`).join(", ")).forEach(panel => panel.remove());
  }

  private render() {
    this.shadow.innerHTML = /* html */ `
      <style>
        :host {
          position: fixed;
          top: calc(var(--debug-offset, 0px) + env(safe-area-inset-top));
          left: .25rem;
          right: .25rem;
          z-index: 9998;
          display: flex;
          align-items: center;
          gap: .25rem;
          padding: .25rem .5rem;
          box-sizing: border-box;
          background: rgba(0, 0, 0, .7);
          color: #0f0;
          font: .75rem/1.25rem monospace;
          border-radius: 0 0 .5rem .5rem;
          pointer-events: auto;
        }
        .spread { flex: 1; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .label { color: #ff0; }
        button {
          font: inherit; color: inherit; background: none; border: .0625rem solid #0f0; border-radius: .25rem;
          min-width: 1.75rem; height: 1.5rem; padding: 0 .375rem; cursor: pointer; touch-action: manipulation;
        }
        button.on { background: #0f0; color: #000; }
      </style>
      <span class="label">editor</span>
      <button data-action="previous" aria-label="Previous spread">‹</button>
      <button data-action="next" aria-label="Next spread">›</button>
      <span class="spread"></span>
      ${PANELS.map(panel => `<button data-panel="${panel}">${panel}</button>`).join("")}
      <button data-action="exit" aria-label="Leave the editor">exit</button>
    `;
    this.renderSpread();
    this.renderPanels();
  }

  private renderSpread() {
    const spread = getSpreads().find(s => s.id === this.game.state.currentSpread);
    const label = this.shadow.querySelector(".spread");
    if (label) label.textContent = spread ? `p. ${spread.title}` : "–";
  }

  private renderPanels() {
    this.shadow.querySelectorAll<HTMLButtonElement>("button[data-panel]").forEach(button =>
      button.classList.toggle("on", !!document.querySelector(`${button.dataset.panel}-panel`)));
  }

  /** Open a panel (closing the other); open again = close */
  private openPanel(name: PanelName) {
    const tag = `${name}-panel`;
    const open = document.querySelector(tag);
    document.querySelectorAll(PANELS.map(panel => `${panel}-panel`).join(", ")).forEach(panel => panel.remove());
    if (!open) document.body.appendChild(document.createElement(tag));
    this.renderPanels();
  }

  private step(direction: 1 | -1) {
    const spreads = getSpreads();
    const index = spreads.findIndex(spread => spread.id === this.game.state.currentSpread);
    const next = spreads[(index + direction + spreads.length) % spreads.length];
    if (next) this.game.spreads.switchSpread(next.id);
  }

  /** The page opened (again): the preview panel, unless a panel is open */
  private onOpened = () => {
    if (!document.querySelector(PANELS.map(panel => `${panel}-panel`).join(", "))) this.openPanel("preview");
    else this.renderPanels();
  };

  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!button) return;
    if (button.dataset.panel) return this.openPanel(button.dataset.panel as PanelName);
    switch (button.dataset.action) {
      case "previous":
        return this.step(-1);
      case "next":
        return this.step(1);
      case "exit":
        return this.game.router.navigate("/spread");
    }
  };
}

customElements.define("editor-bar", EditorBar);
