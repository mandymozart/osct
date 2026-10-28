import { adoptDesignStyles } from "@/styles";

/** Pointer travel before a press becomes a scrub (a shorter move is a tap that focuses the field) */
const SCRUB_START_PX = 4;
/** Pixels of travel per step while scrubbing */
const PX_PER_STEP = 2;

/** Feather "rotate-ccw" (MIT) – the one reset arrow */
const RESET_ICON = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`;

/** Parse a typed number: a comma works as the decimal point */
const parse = (text: string): number | null => {
  const trimmed = text.trim().replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

/**
 * `<scrub-number>`: a number control where the whole field is the gesture – a tap focuses it for typing (the value
 * selected), press and slide scrubs left / right by `step` per few pixels (Shift ×10, Alt ×0.1), ↑ ↓ step (Shift ×10),
 * Enter commits, Escape reverts. The unit follows the number; a reset arrow inside the field shows while the value
 * differs from `default` and sets it back. No native slider: the tools' controls stay one height and one width.
 *
 * Attributes: `value`, `min`, `max`, `step`, `default`, `unit`, `prefix` (a tag before the number: X / Y / Z), `label`
 * (accessible name), `strict` (a value outside
 * min … max is refused and shown as a problem – otherwise any finite number, `positive` = must be > 0).
 * Events (bubble): `input` with every valid change while scrubbing or typing, `change` when a value is committed
 * (scrub ended, Enter, blur, reset). Read `.value` (number).
 */
export class ScrubNumber extends HTMLElement {
  static observedAttributes = ["value", "min", "max", "step", "default", "unit", "label", "prefix", "strict", "positive", "disabled"];

  private input: HTMLInputElement;
  private reset: HTMLButtonElement;
  private unitEl: HTMLSpanElement;
  private prefixEl: HTMLSpanElement;
  private problemEl: HTMLSpanElement;
  private _value = 0;
  private press: { pointerId: number; x: number; start: number; scrubbing: boolean } | null = null;
  private typing = false;
  /** The value before typing began – Escape and an invalid entry go back to it */
  private typingStart = 0;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    adoptDesignStyles(root);
    root.innerHTML = /* html */ `
      <style>
        :host { display: inline-flex; flex-direction: column; min-width: 0; --control: var(--control-height, 2rem); }
        .frame { position: relative; display: flex; align-items: center; height: var(--control); min-width: 0;
          border: var(--rule); border-radius: 999rem; background: var(--glass-background);
          -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); touch-action: pan-y;
          cursor: ew-resize; user-select: none; }
        .frame.scrubbing { border-color: var(--color-accent); }
        .frame.typing { cursor: text; }
        input { flex: 1; min-width: 0; width: 100%; height: 100%; padding: 0 .25rem 0 .75rem; border: none; background: none;
          font: inherit; letter-spacing: inherit; color: var(--color-on-dark); text-align: right; outline: none; cursor: inherit;
          font-variant-numeric: tabular-nums; }
        input::selection { background: var(--color-accent); color: #000; }
        .unit { flex: none; padding-right: .5rem; color: var(--color-muted); font-size: var(--text-size-small); }
        .unit:empty { padding-right: .4rem; }
        .prefix { flex: none; padding-left: .6rem; color: var(--color-muted); font-size: var(--text-size-small); letter-spacing: .08em; }
        .prefix:empty { display: none; }
        .prefix + input { padding-left: .25rem; }
        .reset { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--control); height: 100%;
          border: none; background: none; color: var(--color-muted); cursor: pointer; font: inherit; padding: 0; }
        .reset:hover, .reset:focus-visible { color: var(--color-on-dark); outline: none; }
        .reset[hidden] { display: none; }
        .problem { color: #f66; font-size: var(--text-size-small); line-height: 1rem; padding: 0 .75rem; }
        .problem:empty { display: none; }
        :host([disabled]) .frame { opacity: .5; pointer-events: none; }
      </style>
      <div class="frame design">
        <span class="prefix"></span>
        <input type="text" inputmode="decimal" enterkeyhint="done" spellcheck="false" autocomplete="off">
        <span class="unit"></span>
        <button type="button" class="reset" hidden>${RESET_ICON}</button>
      </div>
      <span class="problem"></span>
    `;
    this.input = root.querySelector("input")!;
    this.reset = root.querySelector(".reset")!;
    this.unitEl = root.querySelector(".unit")!;
    this.prefixEl = root.querySelector(".prefix")!;
    this.problemEl = root.querySelector(".problem")!;
    const frame = root.querySelector<HTMLElement>(".frame")!;
    frame.addEventListener("pointerdown", this.onPointerDown);
    frame.addEventListener("pointermove", this.onPointerMove);
    frame.addEventListener("pointerup", this.onPointerUp);
    frame.addEventListener("pointercancel", this.onPointerUp);
    this.input.addEventListener("keydown", this.onKey);
    this.input.addEventListener("input", () => this.onTyped(false));
    this.input.addEventListener("blur", () => this.commitTyped());
    this.reset.addEventListener("click", event => {
      event.stopPropagation();
      this.commit(this.defaultValue ?? 0, true);
    });
  }

  get value(): number {
    return this._value;
  }

  set value(value: number) {
    this.setAttribute("value", String(value));
  }

  private get step(): number {
    const step = Number(this.getAttribute("step"));
    return step > 0 ? step : 1;
  }

  private get min(): number | null {
    const min = this.getAttribute("min");
    return min === null || min === "" ? null : Number(min);
  }

  private get max(): number | null {
    const max = this.getAttribute("max");
    return max === null || max === "" ? null : Number(max);
  }

  private get defaultValue(): number | null {
    const value = this.getAttribute("default");
    return value === null || value === "" ? null : Number(value);
  }

  /** Decimals the field shows: those of the step */
  private get decimals(): number {
    return String(this.step).split(".")[1]?.length ?? 0;
  }

  attributeChangedCallback(name: string) {
    switch (name) {
      case "value":
        this._value = Number(this.getAttribute("value")) || 0;
        if (!this.typing) this.show();
        break;
      case "unit":
        this.unitEl.textContent = this.getAttribute("unit") ?? "";
        break;
      case "prefix":
        this.prefixEl.textContent = this.getAttribute("prefix") ?? "";
        break;
      case "label":
        this.input.setAttribute("aria-label", this.getAttribute("label") ?? "");
        this.reset.setAttribute("aria-label", `Reset ${this.getAttribute("label") ?? ""}`);
        this.reset.title = "Reset";
        break;
      case "default":
      case "step":
        this.show();
        break;
      case "disabled":
        this.input.disabled = this.hasAttribute("disabled");
        break;
    }
  }

  private show(): void {
    this.input.value = (+this._value.toFixed(Math.max(this.decimals, 0))).toString();
    const base = this.defaultValue;
    this.reset.hidden = base === null || Math.abs(base - this._value) < 1e-9;
    this.problemEl.textContent = "";
  }

  /** Why a value is refused, or null */
  private problem(value: number): string | null {
    if (this.hasAttribute("strict") && ((this.min !== null && value < this.min) || (this.max !== null && value > this.max))) {
      return `${this.min ?? "…"} … ${this.max ?? "…"}`;
    }
    if (this.hasAttribute("positive") && value <= 0) return "must be > 0";
    return null;
  }

  private clamp(value: number): number {
    const min = this.min, max = this.max;
    if (this.hasAttribute("strict")) {
      if (min !== null) value = Math.max(min, value);
      if (max !== null) value = Math.min(max, value);
    }
    if (this.hasAttribute("positive") && value <= 0) value = this.step;
    return +value.toFixed(6);
  }

  private apply(value: number, final: boolean): void {
    this._value = value;
    this.setAttribute("value", String(value));
    this.show();
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    if (final) this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  private commit(value: number, final = true): void {
    this.apply(this.clamp(value), final);
  }

  // ── Scrubbing: the whole frame ──────────────────────────────────────────────────────────────

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.hasAttribute("disabled")) return;
    this.press = { pointerId: event.pointerId, x: event.clientX, start: this._value, scrubbing: false };
  };

  private onPointerMove = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || press.pointerId !== event.pointerId) return;
    const dx = event.clientX - press.x;
    if (!press.scrubbing) {
      if (Math.abs(dx) < SCRUB_START_PX) return;
      press.scrubbing = true;
      this.typing = false;
      this.input.blur();
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      (event.currentTarget as HTMLElement).classList.add("scrubbing");
      event.preventDefault();
    }
    const factor = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    const steps = Math.round(dx / PX_PER_STEP);
    this.apply(this.clamp(press.start + steps * this.step * factor), false);
  };

  private onPointerUp = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || press.pointerId !== event.pointerId) return;
    this.press = null;
    const frame = event.currentTarget as HTMLElement;
    frame.classList.remove("scrubbing");
    if (press.scrubbing) {
      this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return;
    }
    // A tap: type
    this.typing = true;
    this.typingStart = this._value;
    frame.classList.add("typing");
    this.input.focus();
    this.input.select();
  };

  // ── Typing ──────────────────────────────────────────────────────────────────────────────────

  private onKey = (event: KeyboardEvent): void => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const factor = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
      this.commit(this._value + (event.key === "ArrowUp" ? 1 : -1) * this.step * factor);
      this.input.select();
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.commitTyped();
      this.input.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.revertTyped();
      this.input.blur();
    }
  };

  /** While typing: a valid number is applied live (no change event yet) */
  private onTyped(final: boolean): void {
    const value = parse(this.input.value);
    if (value === null) {
      this.problemEl.textContent = this.input.value.trim() ? "not a number" : "";
      return;
    }
    const problem = this.problem(value);
    this.problemEl.textContent = problem ?? "";
    if (problem) return;
    this._value = value;
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    if (final) this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  private commitTyped(): void {
    if (!this.typing) return;
    const value = parse(this.input.value);
    if (value === null || this.problem(value)) return this.revertTyped();
    this.typing = false;
    this.shadowRoot?.querySelector(".frame")?.classList.remove("typing");
    this.commit(value);
  }

  /** Typing ended without a valid number: the value from before */
  private revertTyped(): void {
    this.typing = false;
    this.shadowRoot?.querySelector(".frame")?.classList.remove("typing");
    const changed = this._value !== this.typingStart;
    this._value = this.typingStart;
    this.show();
    if (changed) this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
}

if (!customElements.get("scrub-number")) customElements.define("scrub-number", ScrubNumber);
