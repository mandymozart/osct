import { EntityData, FILTER_TYPES, FilterType, IGame, Target, TUNE_ENTITY_EVENT, TuneEntityDetail } from "@/types";
import { GameStoreService } from "@/services";
import { getEntityRef, getTarget, getTargets, getTargetsUsingEntity } from "@/utils/game-config";
import {
  addFilter, getValue, hasUniformScale, parseNumber, removeFilter, setValue, tuneRows, tuneYaml, TuneRow, TuneValue, valueProblem,
} from "./tune-values";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Up to the row's step decimals – what the field shows */
const display = (row: TuneRow, value: TuneValue): string => {
  if (typeof value !== "number") return String(value);
  const decimals = String(row.step ?? 0.01).split(".")[1]?.length ?? 0;
  return String(+value.toFixed(decimals));
};

/** Tuned entities by target id – they stay while the app runs (panel closed, spread switched) */
const tuned = new Map<string, { entity: EntityData; uniformScale: boolean }>();

/**
 * Debug tune panel (bottom sheet, opened from the debug overlay): every adjustable value of a target's entity –
 * placement (three.js names: `position.x`, `rotation.y`, `scale`) and each filter's parameters – as a slider plus a
 * number field for exact values. Opens with the content's values; changes show live in the AR scene
 * (TUNE_ENTITY_EVENT), the content stays unchanged. "Copy YAML" copies the entity's `params` / `filters` with the file
 * they belong in, for pasting into the content (or a Claude session). Rows come from the definitions
 * (`PLACEMENT_PARAMS`, `FILTERS`) – a new filter or parameter needs no panel code.
 */
export class TunePanel extends HTMLElement {
  private shadow: ShadowRoot;
  private game: Readonly<IGame>;
  private cleanups: Array<() => void> = [];
  private targetId: string | null = null;
  private entity: EntityData | null = null;
  private uniformScale = true;
  private rows: TuneRow[] = [];
  private frame = 0;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    // Taps on the panel are UI, not taps on the AR scene (ArScene ignores dialogs)
    this.setAttribute("role", "dialog");
    this.setAttribute("aria-label", "Tune entity");
    this.cleanups.push(
      this.game.subscribeToProperty("currentSpread", () => this.selectTarget(null)),
      this.game.subscribeToProperty("trackedTargets", () => {
        if (!this.targetId) this.selectTarget(null);
        else this.renderTargets();
      }),
    );
    this.shadow.addEventListener("input", this.onInput);
    this.shadow.addEventListener("change", this.onChange);
    this.shadow.addEventListener("keydown", this.onKey as EventListener);
    this.shadow.addEventListener("click", this.onClick);
    this.selectTarget(null);
  }

  disconnectedCallback() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    cancelAnimationFrame(this.frame);
  }

  /** Targets of the current spread that have an entity */
  private targets(): Target[] {
    const spread = this.game.state.currentSpread;
    return spread ? getTargets(spread).filter(t => t.entity) : [];
  }

  /** `null`: the last found target with an entity, else the spread's first */
  private selectTarget(id: string | null) {
    const targets = this.targets();
    const tracked = this.game.state.trackedTargets;
    const target =
      targets.find(t => t.id === id) ??
      [...tracked].reverse().map(t => targets.find(c => c.id === t)).find(Boolean) ??
      targets.find(t => t.id === this.targetId) ??
      targets[0];
    this.targetId = target?.id ?? null;
    const state = target && (tuned.get(target.id) ?? { entity: target.entity!, uniformScale: hasUniformScale(target.entity!) });
    this.entity = state?.entity ?? null;
    this.uniformScale = state?.uniformScale ?? true;
    this.render();
  }

  private render() {
    const entity = this.entity;
    const target = this.targetId ? getTarget(this.targetId) : undefined;
    this.rows = entity ? tuneRows(entity, this.uniformScale) : [];
    const sections: string[] = [];
    if (entity) {
      sections.push(`<div class="section"><span>placement</span>
        <label class="small"><input type="checkbox" data-action="uniform" ${this.uniformScale ? "checked" : ""}> uniform scale</label></div>`);
      sections.push(...this.rows.filter(r => !r.id.startsWith("filters.")).map(r => this.rowHtml(r)));
      (entity.filters ?? []).forEach((filter, i) => {
        sections.push(`<div class="section"><span>filters[${i}] ${escapeHtml(filter.type)}</span>
          <button data-action="remove-filter" data-index="${i}">remove</button></div>`);
        sections.push(...this.rows.filter(r => r.id.startsWith(`filters.${i}.`)).map(r => this.rowHtml(r)));
      });
      if (entity.type === "video") {
        sections.push(`<div class="section"><span>add filter</span><span>${FILTER_TYPES
          .map(type => `<button data-action="add-filter" data-type="${type}">+ ${type}</button>`).join(" ")}</span></div>`);
      }
    }

    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          left: .25rem;
          right: .25rem;
          bottom: calc(env(safe-area-inset-bottom) + .25rem);
          max-height: 45vh;
          overflow-y: auto;
          z-index: 10000;
          box-sizing: border-box;
          padding: .25rem .5rem .5rem;
          border-radius: .5rem;
          background: rgba(0, 0, 0, .8);
          color: #0f0;
          font: .75rem/1.25rem monospace;
          cursor: default;
          user-select: none;
        }
        .head, .section, .actions { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
        .head { position: sticky; top: -.25rem; background: #000; padding: .25rem 0; z-index: 1; }
        .section { color: #fff; border-top: .0625rem solid #0f0; margin-top: .25rem; padding-top: .25rem; }
        .row { display: grid; grid-template-columns: 7.5rem 1fr 4.5rem 1.5rem; gap: .375rem; align-items: center; min-height: 1.75rem; }
        .row label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #9c9; }
        .row.changed label { color: #fff; }
        .row.changed label::before { content: "● "; color: #ff0; }
        input[type=range] { width: 100%; min-width: 0; margin: 0; }
        input.field { box-sizing: border-box; width: 100%; font: inherit; color: #0f0; background: #000;
          border: .0625rem solid #060; border-radius: .25rem; padding: 0 .25rem; height: 1.5rem; text-align: right; }
        input.field.bad { border-color: #f33; color: #f33; }
        input[type=color] { width: 100%; height: 1.5rem; border: none; padding: 0; background: none; }
        .choices { display: flex; gap: .25rem; grid-column: span 2; }
        button, select { font: inherit; color: inherit; background: none; border: .0625rem solid #0f0;
          border-radius: .25rem; padding: 0 .375rem; cursor: pointer; }
        button.on { background: #0f0; color: #000; }
        button.reset { border: none; padding: 0; opacity: .4; }
        .row.default button.reset { visibility: hidden; }
        select { max-width: 60%; background: #000; }
        .small { font-size: .6875rem; color: #9c9; }
        .problem { color: #f33; grid-column: 2 / span 3; font-size: .6875rem; line-height: 1rem; }
        pre { margin: .5rem 0 .25rem; padding: .375rem; background: #000; border: .0625rem solid #060;
          color: #cfc; white-space: pre-wrap; user-select: text; }
        .empty { padding: .5rem 0; color: #9c9; }
      </style>
      <div class="head">
        <select data-action="target" aria-label="Target">${this.targets().map(t => `<option value="${escapeHtml(t.id)}"
          ${t.id === this.targetId ? "selected" : ""}>${this.game.state.trackedTargets.includes(t.id) ? "◉ " : ""}${escapeHtml(t.id)}
          · ${escapeHtml(t.entity!.type)}${tuned.has(t.id) ? " *" : ""}</option>`).join("")}</select>
        <span class="small">${target ? escapeHtml(this.sourceLabel(target)) : ""}</span>
        <button data-action="close" aria-label="Close">×</button>
      </div>
      ${entity ? sections.join("") : `<div class="empty">No target with AR content on this spread.</div>`}
      ${entity ? `<pre id="yaml"></pre>
      <div class="actions">
        <button data-action="revert">Back to content</button>
        <button data-action="copy" id="copy">Copy YAML</button>
      </div>` : ""}
    `;
    this.rows.forEach(row => this.updateRow(row));
    this.updateYaml();
  }

  private sourceLabel(target: Target): string {
    const ref = getEntityRef(target.id);
    return ref ? `shared: ${ref} (${getTargetsUsingEntity(ref).length}×)` : `entry: ${target.entryId}`;
  }

  /** The target list only (found marks) – the rows keep their state */
  private renderTargets() {
    const select = this.shadow.querySelector<HTMLSelectElement>("select[data-action=target]");
    if (!select) return;
    const tracked = this.game.state.trackedTargets;
    Array.from(select.options).forEach(option => {
      option.textContent = option.textContent!.replace(/^◉ /, "");
      if (tracked.includes(option.value)) option.textContent = `◉ ${option.textContent}`;
    });
  }

  private rowHtml(row: TuneRow): string {
    const label = row.id.replace(/^filters\.\d+\./, "");
    const title = escapeHtml(`${row.description}${row.unit ? ` (${row.unit})` : ""} – default ${row.default}`);
    const name = escapeHtml(row.id);
    let control: string;
    if (row.kind === "color") {
      control = `<input type="color" data-row="${row.id}" aria-label="${name} picker">
        <input class="field" data-row="${row.id}" spellcheck="false" aria-label="${name}">`;
    } else if (row.kind === "choice") {
      control = `<span class="choices">${row.options!.map(o =>
        `<button data-row="${row.id}" data-value="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}</span>`;
    } else {
      control = `<input type="range" data-row="${row.id}" min="${row.min}" max="${row.max}" step="${row.step}" aria-label="${name} slider">
        <input class="field" data-row="${row.id}" inputmode="decimal" enterkeyhint="done" spellcheck="false" aria-label="${name}">`;
    }
    return `<div class="row" data-for="${row.id}" title="${title}">
      <label>${escapeHtml(label)}${row.unit === "°" ? " °" : ""}</label>${control}
      <button class="reset" data-action="reset" data-row="${row.id}" aria-label="Reset ${escapeHtml(label)} to ${row.default}">↺</button>
    </div>`;
  }

  /** Show a row's value in its controls; marks rows that differ from the content and rows at their default */
  private updateRow(row: TuneRow, skip?: Element) {
    if (!this.entity) return;
    const value = getValue(this.entity, row);
    const target = this.targetId ? getTarget(this.targetId) : undefined;
    const content = target?.entity ? getValue(target.entity, row) : value;
    const same = (a: TuneValue, b: TuneValue) => (typeof a === "number" ? +a.toFixed(4) === +Number(b).toFixed(4) : a === b);
    const element = this.shadow.querySelector(`.row[data-for="${row.id}"]`);
    element?.classList.toggle("changed", !same(value, content));
    element?.classList.toggle("default", same(value, row.default));
    element?.querySelectorAll<HTMLElement>(`[data-row="${row.id}"]`).forEach(control => {
      if (control === skip) return;
      if (control instanceof HTMLInputElement && control.type !== "checkbox") {
        control.value = control.type === "range" || control.type === "color" ? String(value) : display(row, value);
        control.classList.remove("bad");
      } else if (control.dataset.value !== undefined) {
        control.classList.toggle("on", control.dataset.value === value);
      }
    });
    element?.querySelector(".problem")?.remove();
  }

  private updateYaml() {
    const pre = this.shadow.getElementById("yaml");
    const target = this.targetId ? getTarget(this.targetId) : undefined;
    if (!pre || !this.entity || !target) return;
    const ref = getEntityRef(target.id);
    pre.textContent = tuneYaml(this.entity, { entryId: target.entryId, ref, usedBy: ref ? getTargetsUsingEntity(ref) : undefined }, this.uniformScale);
  }

  /** New entity values: remember them, show them in the scene (once per frame) */
  private apply(entity: EntityData, changed?: TuneRow, skip?: Element) {
    this.entity = entity;
    if (this.targetId) tuned.set(this.targetId, { entity, uniformScale: this.uniformScale });
    if (changed) this.updateRow(changed, skip);
    this.updateYaml();
    cancelAnimationFrame(this.frame);
    const targetId = this.targetId;
    this.frame = requestAnimationFrame(() => {
      if (targetId) document.dispatchEvent(new CustomEvent<TuneEntityDetail>(TUNE_ENTITY_EVENT, { detail: { targetId, entity } }));
    });
  }

  private rowOf(element: Element): TuneRow | undefined {
    const id = (element as HTMLElement).dataset?.row;
    return id ? this.rows.find(r => r.id === id) : undefined;
  }

  /** Slider and color picker: applied while dragging */
  private onInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const row = this.rowOf(input);
    if (!row || !this.entity) return;
    if (input.type === "range") this.apply(setValue(this.entity, row, Number(input.value)), row, input);
    else if (input.type === "color") this.apply(setValue(this.entity, row, input.value), row, input);
    else input.classList.remove("bad");
  };

  /** Number / color field: applied on Enter or when leaving the field */
  private onChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.action === "target") return this.selectTarget((input as unknown as HTMLSelectElement).value);
    if (input.dataset.action === "uniform") {
      this.uniformScale = input.checked;
      if (this.entity) this.apply(this.entity);
      return this.render();
    }
    if (input.classList.contains("field")) this.commitField(input);
  };

  private onKey = (event: KeyboardEvent) => {
    const input = event.target as HTMLInputElement;
    if (event.key === "Enter" && input.classList?.contains("field")) {
      this.commitField(input);
      input.blur();
    }
  };

  private commitField(input: HTMLInputElement) {
    const row = this.rowOf(input);
    if (!row || !this.entity) return;
    const problem = valueProblem(row, input.value);
    const element = input.closest(".row");
    element?.querySelector(".problem")?.remove();
    if (problem) {
      input.classList.add("bad");
      element?.insertAdjacentHTML("beforeend", `<span class="problem">${escapeHtml(problem)}</span>`);
      return;
    }
    const value = row.kind === "number" ? parseNumber(input.value)! : input.value.trim().toLowerCase();
    this.apply(setValue(this.entity, row, value), row);
  }

  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!button || !this.entity) {
      if (button?.dataset.action === "close") this.remove();
      return;
    }
    const row = this.rowOf(button);
    switch (button.dataset.action) {
      case "close":
        return this.remove();
      case "reset":
        if (row) this.apply(setValue(this.entity, row, row.default), row);
        return;
      case "add-filter":
        this.apply(addFilter(this.entity, button.dataset.type as FilterType));
        return this.render();
      case "remove-filter":
        this.apply(removeFilter(this.entity, Number(button.dataset.index)));
        return this.render();
      case "revert":
        return this.revert();
      case "copy":
        return void this.copy(button);
    }
    // A choice (e.g. a chroma key's mode): other defaults may follow (luma) – rows are rebuilt
    if (row && button.dataset.value !== undefined) {
      this.apply(setValue(this.entity, row, button.dataset.value));
      this.render();
    }
  };

  /** The content's values again, in the panel and the scene */
  private revert() {
    if (!this.targetId) return;
    tuned.delete(this.targetId);
    document.dispatchEvent(new CustomEvent<TuneEntityDetail>(TUNE_ENTITY_EVENT, { detail: { targetId: this.targetId, entity: null } }));
    this.selectTarget(this.targetId);
  }

  private async copy(button: HTMLElement) {
    const text = this.shadow.getElementById("yaml")?.textContent ?? "";
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // No clipboard API (http on a LAN address): copy through a selected text field
      const area = document.createElement("textarea");
      area.value = text;
      this.shadow.appendChild(area);
      area.select();
      copied = document.execCommand("copy");
      area.remove();
    }
    button.textContent = copied ? "Copied" : "Copy failed – select the text";
    setTimeout(() => (button.textContent = "Copy YAML"), 1500);
  }
}

if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true") {
  customElements.define("tune-panel", TunePanel);
}
