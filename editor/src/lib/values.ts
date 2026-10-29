import {
  AssetData,
  ComponentData,
  componentSpec,
  componentTypes,
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
  kind: "number" | "color" | "choice" | "boolean" | "string";
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

/** The rows of a component (`components.{i}.{name}`), from its spec */
export const componentRows = (component: ComponentData, index: number): ValueRow[] => {
  const spec = componentSpec(component.type);
  if (!spec) return [];
  return Object.entries(spec.params).map(([name, param]): ValueRow => {
    const id = `components.${index}.${name}`;
    switch (param.kind) {
      case "color": return { id, kind: "color", default: param.default, description: param.description };
      case "choice": return { id, kind: "choice", default: param.default, options: param.options, description: param.description };
      case "boolean": return { id, kind: "boolean", default: param.default ? "true" : "false", description: param.description };
      case "string": return { id, kind: "string", default: param.default, description: param.description };
      default: return {
        id, kind: "number", default: param.default, min: param.min, max: param.max, step: param.step ?? (param.max - param.min <= 1 ? 0.001 : 0.01),
        unit: param.unit, strict: true, description: param.description,
      };
    }
  });
};

/** The component types a node of `type` may take */
export const componentTypesFor = (type: EntityData["type"]): string[] =>
  componentTypes().filter(key => {
    const nodeTypes = componentSpec(key)?.nodeTypes as readonly string[] | undefined;
    return !nodeTypes || nodeTypes.includes(type);
  });

export const valueRows = (entity: EntityData, uniformScale: boolean): ValueRow[] => [
  ...placementRows(entity, uniformScale),
  ...(entity.filters ?? []).flatMap(filterRows),
  ...(entity.components ?? []).flatMap(componentRows),
];

/** The value the entity shows for a row (placement: params or the type's default; filters: value or default) */
export const getValue = (entity: EntityData, row: ValueRow): RowValue => {
  const [head, second, third] = row.id.split(".");
  if (head === "filters") {
    const value = entity.filters?.[Number(second)]?.[third];
    return (value as RowValue | undefined) ?? row.default;
  }
  if (head === "components") {
    const value = entity.components?.[Number(second)]?.[third];
    if (value === undefined) return row.default;
    return row.kind === "boolean" ? (value ? "true" : "false") : (value as RowValue);
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
  if (head === "components") {
    const components = (entity.components ?? []).map((component, i) =>
      i === Number(second) ? { ...component, [third]: row.kind === "boolean" ? value === "true" : value } : component);
    return { ...entity, components };
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

export const addComponent = (entity: EntityData, type: string): EntityData =>
  ({ ...entity, components: [...(entity.components ?? []), { type }] });

export const removeComponent = (entity: EntityData, index: number): EntityData => {
  const components = (entity.components ?? []).filter((_, i) => i !== index);
  const next: EntityData = { ...entity, components };
  if (!components.length) delete next.components;
  return next;
};

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
  if (entity.components) {
    result.components = entity.components.map((component, i) => {
      const kept: Record<string, unknown> = { type: component.type };
      componentRows(component, i).forEach(row => {
        const name = row.id.split(".")[2];
        const value = getValue(entity, row);
        if (!sameValue(value, row.default)) kept[name] = row.kind === "boolean" ? value === "true" : typeof value === "number" ? round(value) : value;
      });
      return kept as ComponentData;
    });
    if (!result.components.length) delete result.components;
  }
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

// ── The entity as a tree of nodes (content schema 2.0) ──────────────────────────────────────────

/** The node at `path` (`[]` = the root, `[1, 0]` = the second child's first), undefined when the tree has none there */
export const nodeAt = (root: EntityData | undefined, path: number[]): EntityData | undefined =>
  path.reduce<EntityData | undefined>((node, index) => node?.children?.[index], root);

/** A copy of the tree with the node at `path` replaced */
export const withNode = (root: EntityData, path: number[], node: EntityData): EntityData =>
  path.length
    ? { ...root, children: (root.children ?? []).map((child, i) => (i === path[0] ? withNode(child, path.slice(1), node) : child)) }
    : node;

/** A copy of the tree with `child` appended to the node at `path` */
export const addChild = (root: EntityData, path: number[], child: EntityData): EntityData => {
  const parent = nodeAt(root, path) ?? root;
  return withNode(root, path, { ...parent, children: [...(parent.children ?? []), child] });
};

/** A copy of the tree without the node at `path` (never the root) */
export const removeNode = (root: EntityData, path: number[]): EntityData => {
  if (!path.length) return root;
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(root, parentPath) ?? root;
  const children = (parent.children ?? []).filter((_, i) => i !== path[path.length - 1]);
  const next: EntityData = { ...parent };
  if (children.length) next.children = children;
  else delete next.children;
  return withNode(root, parentPath, next);
};

/** The whole tree as the content stores it (`contentEntity` on every node; an even scale as one number) */
export const contentTree = (root: EntityData): EntityData => {
  const node = contentEntity(root, hasUniformScale(root));
  if (node.children) node.children = node.children.map(contentTree);
  return node;
};

/** A new node of a type: fileless types at once, model / video / image with the asset chosen from the book */
export const newNode = (type: EntityData["type"], asset?: { id: string; assetType: AssetData["assetType"]; src: string }): EntityData => ({
  type,
  assets: asset ? [asset] : [],
  ...(type === "text" ? { text: "{{entry.title}}", color: "#ffffff" } : {}),
});
