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
} from "@engine/types";

/**
 * The Entity panel's values: one row per adjustable value of an entity, generated from the content contract's
 * definitions (`PLACEMENT_PARAMS`, `FILTERS`), reading and writing them on an `EntityData` copy. Row ids use the
 * three.js names: `position.x`, `rotation.y`, `scale` (uniform) or `scale.z`, `filters.0.threshold`. A new filter or
 * parameter in the contract needs no panel code.
 */

export type RowValue = number | string;

export interface ValueRow {
  id: string;
  kind: "number" | "color" | "choice";
  default: RowValue;
  /** Scrub range (number rows) */
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

export const placementRows = (entity: EntityData, uniformScale: boolean): ValueRow[] => {
  const defaults = PLACEMENT_DEFAULTS[entity.type] ?? resolvePlacement(entity.type);
  return (Object.keys(PLACEMENT_PARAMS) as PlacementKey[]).flatMap(key => {
    const spec = PLACEMENT_PARAMS[key];
    const row = (id: string, axis: number): ValueRow => ({
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

export const filterRows = (filter: FilterData, index: number): ValueRow[] => {
  const specs = FILTERS[filter.type]?.params ?? {};
  return Object.entries(specs).map(([name, spec]): ValueRow => {
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

export const valueRows = (entity: EntityData, uniformScale: boolean): ValueRow[] => [
  ...placementRows(entity, uniformScale),
  ...(entity.filters ?? []).flatMap(filterRows),
];

/** The value the entity shows for a row (placement: params or the type's default; filters: value or default) */
export const getValue = (entity: EntityData, row: ValueRow): RowValue => {
  const [head, second, third] = row.id.split(".");
  if (head === "filters") {
    const value = entity.filters?.[Number(second)]?.[third];
    return (value as RowValue | undefined) ?? row.default;
  }
  const placement = resolvePlacement(entity.type, entity.params);
  return placement[head as PlacementKey][second ? AXES.indexOf(second as "x") : 0];
};

/** A copy of the entity with the row set to `value` (placement params are written as complete vectors) */
export const setValue = (entity: EntityData, row: ValueRow, value: RowValue): EntityData => {
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
export const valueProblem = (row: ValueRow, text: string): string | null => {
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
export const round = (value: number) => +value.toFixed(4);

/** Two row values are the same as far as the content is concerned */
export const sameValue = (a: RowValue, b: RowValue): boolean =>
  typeof a === "number" ? round(a) === round(Number(b)) : a === b;

/**
 * The entity as the content stores it: placement params only where they differ from the type's defaults, an even
 * scale as one number – what `PUT …/entities/{ref}` and `PUT …/targets/{id}` receive.
 */
export const contentEntity = (entity: EntityData, uniformScale: boolean): EntityData => {
  const placement = resolvePlacement(entity.type, entity.params);
  const defaults = PLACEMENT_DEFAULTS[entity.type] ?? resolvePlacement(entity.type);
  const sameVector = (a: Vector3Data, b: Vector3Data) => a.every((v, i) => round(v) === round(b[i]));
  const { position: _p, rotation: _r, scale: _s, ...other } = entity.params ?? {};
  const params: Record<string, unknown> = { ...other };
  if (!sameVector(placement.position, defaults.position)) params.position = placement.position.map(round);
  if (!sameVector(placement.rotation, defaults.rotation)) params.rotation = placement.rotation.map(round);
  if (!sameVector(placement.scale, defaults.scale)) {
    params.scale = uniformScale && isUniform(placement.scale) ? round(placement.scale[0]) : placement.scale.map(round);
  }
  const result: EntityData = { ...entity };
  if (Object.keys(params).length) result.params = params;
  else delete result.params;
  if (entity.filters) {
    result.filters = entity.filters.map((filter, i) => {
      const kept: Record<string, unknown> = { type: filter.type };
      filterRows(filter, i).forEach(row => {
        const name = row.id.split(".")[2];
        const value = getValue(entity, row);
        if (!sameValue(value, row.default)) kept[name] = typeof value === "number" ? round(value) : value;
      });
      return kept as FilterData;
    });
    if (!result.filters.length) delete result.filters;
  }
  return result;
};
