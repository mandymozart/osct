import {
  EntityData,
  FilterData,
  FILTERS,
  FilterType,
  keyMode,
  PLACEMENT_DEFAULTS,
  PLACEMENT_PARAMS,
  PlacementKey,
  resolvePlacement,
  Vector3Data,
} from "@/types";

/**
 * Values of the debug tune panel: one row per adjustable value of an entity, generated from the definitions
 * (`PLACEMENT_PARAMS`, `FILTERS`), reading and writing them on an `EntityData` copy, and the YAML to paste into
 * the content. Row ids use the three.js names: `position.x`, `rotation.y`, `scale` (uniform) or `scale.z`,
 * `filters.0.threshold`.
 */

export type TuneValue = number | string;

export interface TuneRow {
  id: string;
  kind: "number" | "color" | "choice";
  default: TuneValue;
  /** Slider range (number rows) */
  min?: number;
  max?: number;
  step?: number;
  /** A typed number outside min…max is refused (filters); placement takes any finite number (scale > 0) */
  strict?: boolean;
  options?: readonly string[];
  unit?: string;
  description: string;
}

const AXES = ["x", "y", "z"] as const;

const isUniform = (scale: Vector3Data) => scale[0] === scale[1] && scale[1] === scale[2];

/** The content writes one number for an even scale – the panel then shows one `scale` row */
export const hasUniformScale = (entity: EntityData): boolean =>
  isUniform(resolvePlacement(entity.type, entity.params).scale);

export const placementRows = (entity: EntityData, uniformScale: boolean): TuneRow[] => {
  const defaults = PLACEMENT_DEFAULTS[entity.type] ?? resolvePlacement(entity.type);
  return (Object.keys(PLACEMENT_PARAMS) as PlacementKey[]).flatMap(key => {
    const spec = PLACEMENT_PARAMS[key];
    const row = (id: string, axis: number): TuneRow => ({
      id, kind: "number", default: defaults[key][axis], min: spec.min, max: spec.max, step: spec.step,
      unit: spec.unit, description: spec.description,
    });
    if (key === "scale" && uniformScale) return [row("scale", 0)];
    return AXES.map((axis, i) => row(`${key}.${axis}`, i));
  });
};

/** A chroma key's number defaults differ in luma mode (brightness has another scale) */
const filterMode = (filter: FilterData): string => {
  const mode = filter.mode ?? "auto";
  if (mode !== "auto") return String(mode);
  return keyMode(typeof filter.color === "string" ? filter.color : FILTERS.chromaKey.params.color.default);
};

export const filterRows = (filter: FilterData, index: number): TuneRow[] => {
  const specs = FILTERS[filter.type]?.params ?? {};
  return Object.entries(specs).map(([name, spec]): TuneRow => {
    const id = `filters.${index}.${name}`;
    if (spec.kind === "color") return { id, kind: "color", default: spec.default, description: spec.description };
    if (spec.kind === "choice") return { id, kind: "choice", default: spec.default, options: spec.options, description: spec.description };
    const luma = "lumaDefault" in spec && spec.lumaDefault !== undefined && filterMode(filter) === "luma";
    return {
      id, kind: "number", default: luma ? spec.lumaDefault! : spec.default, min: spec.min, max: spec.max,
      step: spec.max - spec.min <= 1 ? 0.001 : 0.01, strict: true, description: spec.description,
    };
  });
};

export const tuneRows = (entity: EntityData, uniformScale: boolean): TuneRow[] => [
  ...placementRows(entity, uniformScale),
  ...(entity.filters ?? []).flatMap(filterRows),
];

/** The value the entity shows for a row (placement: params or the type's default; filters: value or default) */
export const getValue = (entity: EntityData, row: TuneRow): TuneValue => {
  const [head, second, third] = row.id.split(".");
  if (head === "filters") {
    const value = entity.filters?.[Number(second)]?.[third];
    return value ?? row.default;
  }
  const placement = resolvePlacement(entity.type, entity.params);
  return placement[head as PlacementKey][second ? AXES.indexOf(second as "x") : 0];
};

/** A copy of the entity with the row set to `value` (placement params are written as complete vectors) */
export const setValue = (entity: EntityData, row: TuneRow, value: TuneValue): EntityData => {
  const [head, second, third] = row.id.split(".");
  if (head === "filters") {
    const filters = (entity.filters ?? []).map((filter, i) =>
      i === Number(second) ? { ...filter, [third]: value } : filter);
    return { ...entity, filters };
  }
  const placement = resolvePlacement(entity.type, entity.params);
  const key = head as PlacementKey;
  const vector = [...placement[key]] as Vector3Data;
  if (second) vector[AXES.indexOf(second as "x")] = Number(value);
  else vector.fill(Number(value));
  const params = { ...entity.params, position: placement.position, rotation: placement.rotation, scale: placement.scale, [key]: vector };
  return { ...entity, params };
};

/** Parse a typed number: a comma works as the decimal point (German keyboards) */
export const parseNumber = (text: string): number | null => {
  const trimmed = text.trim().replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

/** Why a typed value is refused, or null when it can be applied */
export const valueProblem = (row: TuneRow, text: string): string | null => {
  if (row.kind === "color") return /^#[0-9a-f]{6}$/i.test(text.trim()) ? null : "expected #rrggbb";
  if (row.kind === "choice") return row.options?.includes(text) ? null : `expected ${row.options?.join(" / ")}`;
  const value = parseNumber(text);
  if (value === null) return "not a number";
  if (row.strict && (value < row.min! || value > row.max!)) return `${row.min} … ${row.max}`;
  if (row.id.startsWith("scale") && value <= 0) return "must be > 0";
  return null;
};

export const addFilter = (entity: EntityData, type: FilterType): EntityData =>
  ({ ...entity, filters: [...(entity.filters ?? []), { type }] });

export const removeFilter = (entity: EntityData, index: number): EntityData =>
  ({ ...entity, filters: (entity.filters ?? []).filter((_, i) => i !== index) });

/** Up to 4 decimals – no floating point noise like 0.30000000000000004 */
const round = (value: number) => +value.toFixed(4);

const sameVector = (a: Vector3Data, b: Vector3Data) => a.every((v, i) => round(v) === round(b[i]));

export interface YamlSource {
  entryId: string;
  /** Shared entity (`content/entities/<ref>/entity.yaml`) and the targets using it */
  ref?: string;
  usedBy?: string[];
}

/**
 * The entity's `params` and `filters` as YAML to paste into the content, under a comment naming the file. Only values
 * that differ from the defaults are written – the block replaces the entity's `params` / `filters`.
 */
export const tuneYaml = (entity: EntityData, source: YamlSource, uniformScale: boolean): string => {
  const lines = source.ref
    ? [`# content/entities/${source.ref}/entity.yaml${source.usedBy?.length ? ` (used by ${source.usedBy.join(", ")})` : ""}`]
    : [`# content/entries/${source.entryId}/entry.yaml → target.entity`];
  const placement = resolvePlacement(entity.type, entity.params);
  const defaults = PLACEMENT_DEFAULTS[entity.type] ?? resolvePlacement(entity.type);
  const vector = (v: Vector3Data) => `[${v.map(round).join(", ")}]`;
  const params: string[] = [];
  (["position", "rotation"] as const).forEach(key => {
    if (!sameVector(placement[key], defaults[key])) params.push(`  ${key}: ${vector(placement[key])}`);
  });
  if (!sameVector(placement.scale, defaults.scale)) {
    params.push(`  scale: ${uniformScale && isUniform(placement.scale) ? round(placement.scale[0]) : vector(placement.scale)}`);
  }
  lines.push(...(params.length ? ["params:", ...params] : ["# params: all defaults – no params needed"]));

  const filters = entity.filters ?? [];
  if (filters.length) {
    lines.push("filters:");
    filters.forEach((filter, i) => {
      lines.push(`  - type: ${filter.type}`);
      filterRows(filter, i).forEach(row => {
        const value = getValue(entity, row);
        const name = row.id.split(".")[2];
        const changed = typeof value === "number" ? round(value) !== round(Number(row.default)) : value !== row.default;
        if (changed) lines.push(`    ${name}: ${typeof value === "number" ? round(value) : row.kind === "color" ? `"${value}"` : value}`);
      });
    });
  } else if (entity.type === "video") {
    lines.push("# filters: none");
  }
  return lines.join("\n");
};
