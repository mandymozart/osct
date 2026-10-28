import { BottomSheet, SHEET_CSS } from "./debug-sheet";
import "./tune-inspector";

/**
 * Debug tune panel (bottom sheet, opened from the debug overlay): hosts the `<tune-inspector>` – every adjustable
 * value of a target's entity, live in the AR scene, "Copy YAML" to paste into the content. The editor hosts the same
 * inspector in its sheet.
 */
export class TunePanel extends HTMLElement {
  private shadow: ShadowRoot;
  private sheet: BottomSheet;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.sheet = new BottomSheet(this, this.shadow, {
      label: "Tune entity", heightKey: "osct-sheet-tune-height", defaultHeight: () => window.innerHeight * 0.45,
    });
  }

  connectedCallback() {
    this.sheet.connect();
    this.shadow.innerHTML = /* html */ `
      <style>
        ${SHEET_CSS}
        .bar { justify-content: space-between; padding-left: .5rem; padding-right: .25rem; }
        .title { color: #fff; }
        .body { padding: .25rem .5rem .75rem; }
      </style>
      <div class="bar"><span class="title">Tune entity</span><button class="close" data-action="close" aria-label="Close">×</button></div>
      <div class="body"><tune-inspector></tune-inspector></div>
    `;
    this.shadow.addEventListener("click", this.onClick);
  }

  disconnectedCallback() {
    this.sheet.disconnect();
    this.shadow.removeEventListener("click", this.onClick);
  }

  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (button?.dataset.action === "close") this.remove();
  };
}

if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true") {
  customElements.define("tune-panel", TunePanel);
}
