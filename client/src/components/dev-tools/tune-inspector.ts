import { EntityData, FILTER_TYPES, FilterType, IGame, Target, TUNE_ENTITY_EVENT, TuneEntityDetail } from "@/types";
import { GameStoreService } from "@/services";
import { adoptDesignStyles } from "@/styles";
import { getEntityRef, getTarget, getTargets, getTargetsUsingEntity } from "@/utils/game-config";
import "@/components/common";
import {
  addFilter, getValue, hasUniformScale, removeFilter, setValue, tuneRows, tuneYaml, TuneRow, TuneValue, valueProblem,
} from "./tune-values";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Tuned entities by target id – they stay while the app runs (panel closed, spread switched, editor left) */
const tuned = new Map<string, { entity: EntityData; uniformScale: boolean }>();

/**
 * `<tune-inspector>`: every adjustable value of a target's entity – placement (three.js names: `position.x`,
 * `rotation.y`, `scale`) and each filter's parameters – as rows of one control height: a label column and a
 * `<scrub-number>` (press and slide, or type), choices as a segmented group, colours as a swatch with its hex. Opens
 * with the content's values; changes show live in the AR scene (TUNE_ENTITY_EVENT), the content stays unchanged.
 * "Copy YAML" copies the entity's `params` / `filters` with the file they belong in. Rows come from the definitions
 * (`PLACEMENT_PARAMS`, `FILTERS`) – a new filter or parameter needs no inspector code. Hosted by the editor's sheet (the
 * app's design) and by the debug tune panel, which sets `theme="debug"` for the dev tools' green look.
 */
export class TuneInspector extends HTMLElement {
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
    adoptDesignStyles(this.shadow);
  }

  connectedCallback() {
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
    this.shadow.removeEventListener("input", this.onInput);
    this.shadow.removeEventListener("change", this.onChange);
    this.shadow.removeEventListener("keydown", this.onKey as EventListener);
    this.shadow.removeEventListener("click", this.onClick);
    cancelAnimationFrame(this.frame);
  }

  /** Targets of the current spread that have an entity */
  private targets(): Target[] {
    const spread = this.game.state.currentSpread;
    return spread ? getTargets(spread).filter(t => t.entity) : [];
  }

  /** `null`: the last found target with an entity, else the spread's first */
  selectTarget(id: string | null) {
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
      sections.push(`<div class="section"><span class="section-label">placement</span>
        <button type="button" class="pill ${this.uniformScale ? "on" : ""}" data-action="uniform" aria-pressed="${this.uniformScale}" title="One scale for x, y and z">uniform scale</button></div>`);
      (["position", "rotation", "scale"] as const).forEach(key => {
        const rows = this.rows.filter(r => r.id === key || r.id.startsWith(`${key}.`));
        if (rows.length) sections.push(this.placementRowHtml(key, rows));
      });
      (entity.filters ?? []).forEach((filter, i) => {
        sections.push(`<div class="section"><span class="section-label">filters[${i}] ${escapeHtml(filter.type)}</span>
          <button type="button" class="text-link" data-action="remove-filter" data-index="${i}">remove</button></div>`);
        sections.push(...this.rows.filter(r => r.id.startsWith(`filters.${i}.`)).map(r => this.rowHtml(r)));
      });
      if (entity.type === "video") {
        sections.push(`<div class="section"><span class="section-label">add filter</span><span class="seg">${FILTER_TYPES
          .map(type => `<button type="button" class="pill" data-action="add-filter" data-type="${type}">+ ${type}</button>`).join("")}</span></div>`);
      }
    }

    this.shadow.innerHTML = /* html */ `
      <style>
        :host { display: block; --control-height: var(--tool-control, 2rem); color: var(--color-on-dark); }
        /* The debug overlay's host: the dev tools' green terminal look – the design primitives read these tokens */
        :host([theme="debug"]) {
          --font-design: monospace; --tracking-design: 0; --text-size: .75rem; --text-size-small: .6875rem; --text-line: 1.25rem;
          --color-on-dark: #0f0; --color-muted: #9c9; --color-accent: #0f0; --rule: .0625rem solid #0f0;
          --gold-gradient: linear-gradient(90deg, #0f0, #0f0); --glass-background: rgba(0, 0, 0, .4); --glass-blur: none;
          --shadow-bronze: none; --control-height: 1.5rem;
        }
        :host([theme="debug"]) .pill.on { background-color: #0f0; color: #000; box-shadow: none; }
        :host([theme="debug"]) .pill.on .gold { background-image: none; color: #000; -webkit-text-fill-color: #000; }
        :host([theme="debug"]) .row.changed label::before { color: #ff0; }
        :host([theme="debug"]) pre { color: #cfc; border-color: #060; }
        .head { display: flex; align-items: center; gap: .5rem; min-height: var(--control-height); }
        select.field { height: var(--control-height); min-height: 0; max-width: 60%; color: var(--color-on-dark); background-color: rgba(0,0,0,.4); }
        select.field option { color: #000; }
        .small { color: var(--color-muted); font-size: var(--text-size-small); overflow-wrap: anywhere; }
        .section { display: flex; align-items: center; justify-content: space-between; gap: .5rem; min-height: var(--control-height);
          margin-top: .25rem; border-top: var(--rule); padding-top: .25rem; }
        .section-label { color: var(--color-muted); font-size: var(--text-size-small); letter-spacing: .08em; text-transform: uppercase; }
        .row { display: grid; grid-template-columns: 5rem minmax(0, 1fr); gap: .375rem; align-items: center; min-height: calc(var(--control-height) + .25rem); }
        .row label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-muted); }
        .row.changed label { color: var(--color-on-dark); }
        .row.changed label::before { content: "● "; color: var(--color-accent); }
        scrub-number { width: 100%; }
        .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr)); gap: .25rem; min-width: 0; }
        .seg { display: inline-flex; gap: .25rem; flex-wrap: wrap; }
        :host .pill { height: var(--control-height); min-height: 0; padding: 0 .75rem; color: var(--color-on-dark); }
        :host .pill.on { background-color: rgba(255, 255, 255, .14); box-shadow: inset 0 0 0 .0625rem var(--color-accent); }
        .color { display: grid; grid-template-columns: var(--control-height) minmax(0, 1fr); gap: .375rem; align-items: center; }
        input[type=color] { width: var(--control-height); height: var(--control-height); border: var(--rule); border-radius: 50%; padding: 0; background: none; cursor: pointer; }
        input[type=color]::-webkit-color-swatch-wrapper { padding: .2rem; }
        input[type=color]::-webkit-color-swatch { border: none; border-radius: 50%; }
        :host input.field { height: var(--control-height); min-height: 0; padding: 0 .75rem; }
        input.field.bad { border-color: #f66; color: #f66; }
        .problem { color: #f66; grid-column: 2; font-size: var(--text-size-small); line-height: 1rem; }
        pre { margin: .5rem 0 .25rem; padding: .5rem .75rem; border: var(--rule); border-radius: .5rem; color: var(--color-on-dark);
          font-size: var(--text-size-small); line-height: 1.25; white-space: pre-wrap; user-select: text; }
        .actions { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
        .empty { padding: .5rem 0; color: var(--color-muted); }
      </style>
      <div class="design">
        <div class="head">
          <select class="field" data-action="target" aria-label="Target">${this.targets().map(t => `<option value="${escapeHtml(t.id)}"
            ${t.id === this.targetId ? "selected" : ""}>${this.game.state.trackedTargets.includes(t.id) ? "◉ " : ""}${escapeHtml(t.id)}
            · ${escapeHtml(t.entity!.type)}${tuned.has(t.id) ? " *" : ""}</option>`).join("")}</select>
          <span class="small">${target ? escapeHtml(this.sourceLabel(target)) : ""}</span>
        </div>
        ${entity ? sections.join("") : `<div class="empty">No target with AR content on this spread.</div>`}
        ${entity ? `<pre id="yaml"></pre>
        <div class="actions">
          <button type="button" class="text-link" data-action="revert">Back to content</button>
          <button type="button" class="pill" data-action="copy" id="copy"><span class="gold">Copy YAML</span></button>
        </div>` : ""}
      </div>
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

  /** Position, rotation or scale: the three axes side by side (one field for an even scale), as in Blender */
  private placementRowHtml(key: string, rows: TuneRow[]): string {
    const unit = rows[0].unit ?? "";
    const title = escapeHtml(`${rows[0].description}${unit ? ` (${unit})` : ""} – default ${rows.map(r => r.default).join(", ")}`);
    const fields = rows.map(row => {
      const axis = row.id.split(".")[1];
      return `<scrub-number data-row="${row.id}" min="${row.min}" max="${row.max}" step="${row.step}" default="${row.default}"
        prefix="${axis ? axis.toUpperCase() : ""}" unit="${unit === "°" ? "°" : ""}" label="${escapeHtml(row.id)}"
        ${row.id.startsWith("scale") ? "positive" : ""}></scrub-number>`;
    });
    const changed = rows.map(r => r.id).join(" ");
    return `<div class="row axes" data-for="${changed}" title="${title}"><label>${key}</label>
      <span class="fields">${fields.join("")}</span></div>`;
  }

  private rowHtml(row: TuneRow): string {
    const label = row.id.replace(/^filters\.\d+\./, "");
    const title = escapeHtml(`${row.description}${row.unit ? ` (${row.unit})` : ""} – default ${row.default}`);
    const name = escapeHtml(row.id);
    let control: string;
    if (row.kind === "color") {
      control = `<span class="color"><input type="color" data-row="${row.id}" aria-label="${name} picker">
        <input class="field" data-row="${row.id}" spellcheck="false" aria-label="${name}"></span>`;
    } else if (row.kind === "choice") {
      control = `<span class="seg">${row.options!.map(o =>
        `<button type="button" class="pill" data-row="${row.id}" data-value="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}</span>`;
    } else {
      control = `<scrub-number data-row="${row.id}" min="${row.min}" max="${row.max}" step="${row.step}" default="${row.default}"
        unit="${row.unit && row.unit !== "°" ? escapeHtml(row.unit) : row.unit === "°" ? "°" : ""}" label="${name}"
        ${row.strict ? "strict" : ""} ${row.id.startsWith("scale") ? "positive" : ""}></scrub-number>`;
    }
    return `<div class="row" data-for="${row.id}" title="${title}"><label>${escapeHtml(label)}</label>${control}</div>`;
  }

  /** Show a row's value in its controls; marks rows that differ from the content */
  private updateRow(row: TuneRow, skip?: Element) {
    if (!this.entity) return;
    const value = getValue(this.entity, row);
    const target = this.targetId ? getTarget(this.targetId) : undefined;
    const content = target?.entity ? getValue(target.entity, row) : value;
    const same = (a: TuneValue, b: TuneValue) => (typeof a === "number" ? +a.toFixed(4) === +Number(b).toFixed(4) : a === b);
    const element = this.shadow.querySelector(`.row[data-for="${row.id}"]`) ?? this.shadow.querySelector(`.row[data-for~="${row.id}"]`);
    if (element?.classList.contains("axes")) {
      // The row holds the three axes: it is "changed" when any of them differs from the content
      const ids = (element.getAttribute("data-for") ?? "").split(" ");
      const any = ids.some(id => {
        const other = this.rows.find(r => r.id === id);
        return other && target?.entity && !same(getValue(this.entity!, other), getValue(target.entity, other));
      });
      element.classList.toggle("changed", any);
    } else {
      element?.classList.toggle("changed", !same(value, content));
    }
    element?.querySelectorAll<HTMLElement>(`[data-row="${row.id}"]`).forEach(control => {
      if (control === skip) return;
      if (control.tagName === "SCRUB-NUMBER") {
        control.setAttribute("value", String(value));
      } else if (control instanceof HTMLInputElement) {
        control.value = String(value);
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

  /** Scrub number (while sliding or typing) and colour picker: applied live */
  private onInput = (event: Event) => {
    const control = event.target as HTMLElement;
    const row = this.rowOf(control);
    if (!row || !this.entity) return;
    if (control.tagName === "SCRUB-NUMBER") this.apply(setValue(this.entity, row, (control as HTMLElement & { value: number }).value), row, control);
    else if (control instanceof HTMLInputElement && control.type === "color") this.apply(setValue(this.entity, row, control.value), row, control);
    else if (control instanceof HTMLInputElement) control.classList.remove("bad");
  };

  /** Colour hex field: applied on Enter or when leaving the field; the target select; uniform scale */
  private onChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.action === "target") return this.selectTarget((input as unknown as HTMLSelectElement).value);
    if (input instanceof HTMLInputElement && input.classList.contains("field")) this.commitField(input);
  };

  private onKey = (event: KeyboardEvent) => {
    const input = event.target as HTMLInputElement;
    if (event.key === "Enter" && input.classList?.contains("field") && input.tagName === "INPUT") {
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
    this.apply(setValue(this.entity, row, input.value.trim().toLowerCase()), row);
  }

  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!button || !this.entity) return;
    const row = this.rowOf(button);
    switch (button.dataset.action) {
      case "uniform":
        this.uniformScale = !this.uniformScale;
        this.apply(this.entity);
        return this.render();
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

  /** The content's values again, in the inspector and the scene */
  private revert() {
    if (!this.targetId) return;
    tuned.delete(this.targetId);
    document.dispatchEvent(new CustomEvent<TuneEntityDetail>(TUNE_ENTITY_EVENT, { detail: { targetId: this.targetId, entity: null } }));
    this.selectTarget(this.targetId);
  }

  private async copy(button: HTMLElement) {
    const text = this.shadow.getElementById("yaml")?.textContent ?? "";
    const label = button.querySelector("span") ?? button;
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
    label.textContent = copied ? "Copied" : "Copy failed – select the text";
    setTimeout(() => (label.textContent = "Copy YAML"), 1500);
  }
}

if (!customElements.get("tune-inspector")) customElements.define("tune-inspector", TuneInspector);
