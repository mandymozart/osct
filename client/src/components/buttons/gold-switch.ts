import { adoptDesignStyles } from "@/styles";

/**
 * Settings-style on/off row: label text on the left, switch on the far right; the whole row is the label.
 * Wraps a native checkbox (`role="switch"`) styled by the `.switch` design primitive.
 *
 *   <gold-switch label="Updates" checked data-option="bookUpdates"></gold-switch>
 *
 * Attributes: `label`, `checked`, `disabled`. A change by the reader sets `checked` and fires `change`
 * (bubbles) on the element – read `element.checked`. A tap plays the tap feedback like a button;
 * `data-feedback="none"` on the element silences it.
 */
export class GoldSwitch extends HTMLElement {
  static observedAttributes = ["label", "checked", "disabled"];

  private input: HTMLInputElement;
  private text: HTMLSpanElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    adoptDesignStyles(root);
    root.innerHTML = /* html */ `
      <style>
        :host { display: block; }
        label { width: 100%; }
      </style>
      <label class="switch-row design"><span></span><input type="checkbox" role="switch" class="switch" data-feedback="tap"></label>
    `;
    this.text = root.querySelector("span")!;
    this.input = root.querySelector("input")!;
    this.input.addEventListener("change", () => {
      this.toggleAttribute("checked", this.input.checked);
      // Re-dispatch: the input's own change event does not cross the shadow boundary
      this.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  get checked(): boolean {
    return this.input.checked;
  }

  set checked(on: boolean) {
    this.toggleAttribute("checked", on);
  }

  attributeChangedCallback(name: string) {
    if (name === "label") this.text.textContent = this.getAttribute("label") ?? "";
    if (name === "checked") this.input.checked = this.hasAttribute("checked");
    if (name === "disabled") this.input.disabled = this.hasAttribute("disabled");
  }
}

customElements.define("gold-switch", GoldSwitch);
