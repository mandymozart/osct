import { getPath, setPath, type Spec, type SpecSection, SWATCHES } from "./params";

/**
 * The panel's controls, built from specs: a row per value (label, control, number), grouped in collapsible sections.
 * A section is bound to one values object; `refresh()` reads the values again (another concept, a reset, a gesture
 * on the stage).
 */

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const decimals = (step: number) => (String(step).split(".")[1] ?? "").length;

/** Which sections are open, kept across reloads */
const OPEN_KEY = "osct-reveal-sandbox-open";
const openState: Record<string, boolean> = (() => {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}");
  } catch {
    return {};
  }
})();

export interface Controls {
  readonly element: HTMLElement;
  /** Show the values again; with `values`, bind to another object first */
  refresh(values?: object): void;
}

export const buildSection = (section: SpecSection, initial: object, onChange: (key: string) => void): Controls => {
  let values = initial;
  const details = el("details", "section");
  details.open = openState[section.title] ?? !section.closed;
  details.addEventListener("toggle", () => {
    openState[section.title] = details.open;
    localStorage.setItem(OPEN_KEY, JSON.stringify(openState));
  });
  details.append(el("summary", "", section.title));
  const syncs: Array<() => void> = [];

  const row = (spec: Spec): HTMLElement => {
    const line = el("label", "row");
    if (spec.help) line.title = spec.help;
    line.append(el("span", "label", spec.label));
    const commit = (value: unknown) => {
      setPath(values, spec.key, value);
      onChange(spec.key);
    };
    switch (spec.kind) {
      case "range": {
        const slider = el("input");
        slider.type = "range";
        const number = el("input", "number");
        number.type = "number";
        [slider, number].forEach(input => {
          input.min = String(spec.min);
          input.max = String(spec.max);
          input.step = String(spec.step);
        });
        const show = (value: number) => {
          slider.value = String(value);
          number.value = value.toFixed(decimals(spec.step));
        };
        slider.addEventListener("input", () => {
          commit(Number(slider.value));
          number.value = Number(slider.value).toFixed(decimals(spec.step));
        });
        // A typed value may lie outside the slider's range
        number.addEventListener("change", () => {
          const value = Number(number.value);
          if (!Number.isFinite(value)) return show(Number(getPath(values, spec.key)));
          commit(value);
          slider.value = String(value);
        });
        syncs.push(() => show(Number(getPath(values, spec.key))));
        line.append(slider, number);
        if (spec.unit) line.append(el("span", "unit", spec.unit));
        break;
      }
      case "color": {
        const picker = el("input");
        picker.type = "color";
        const swatches = el("span", "swatches");
        SWATCHES.forEach(color => {
          const swatch = el("button", "swatch");
          swatch.type = "button";
          swatch.style.background = color;
          swatch.title = color;
          swatch.addEventListener("click", event => {
            event.preventDefault();
            picker.value = color;
            commit(color);
          });
          swatches.append(swatch);
        });
        picker.addEventListener("input", () => commit(picker.value));
        syncs.push(() => (picker.value = String(getPath(values, spec.key))));
        line.append(picker, swatches);
        break;
      }
      case "select": {
        const select = el("select");
        spec.options.forEach(([value, label]) => {
          const option = el("option", "", label);
          option.value = value;
          select.append(option);
        });
        select.addEventListener("change", () => commit(select.value));
        syncs.push(() => (select.value = String(getPath(values, spec.key))));
        line.append(select);
        break;
      }
      case "toggle": {
        const box = el("input");
        box.type = "checkbox";
        box.addEventListener("change", () => commit(box.checked));
        syncs.push(() => (box.checked = !!getPath(values, spec.key)));
        line.append(box);
        break;
      }
    }
    return line;
  };

  section.specs.forEach(spec => details.append(row(spec)));
  const refresh = (next?: object) => {
    if (next) values = next;
    syncs.forEach(sync => sync());
  };
  refresh();
  return { element: details, refresh };
};

export { el };
