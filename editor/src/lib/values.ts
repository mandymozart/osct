import {
  AssetData,
  ComponentData,
  ComponentParamSpec,
  componentSpec,
  componentTypes,
  EntityData,
  FilterData,
  FILTERS,
  FilterType,
  keyMode,
  LIGHT_PARAMS,
  LightData,
  nodeTypeSpec,
  PassData,
  PASSES,
  PassSpec,
  PLACEMENT_DEFAULTS,
  PLACEMENT_PARAMS,
  PlacementKey,
  resolvePlacement,
  Vector3Data,
} from "@engine/types";

/**
 * The Entity panel's values: one row per adjustable value of an entity, generated from the content contract's
 * definitions (`PLACEMENT_PARAMS`, `FILTERS`, `componentSpec`, `LIGHT_PARAMS`, `nodeTypeSpec`), reading and writing
 * them on an `EntityData` copy. Row ids use the three.js names: `position.x`, `rotation.y`, `scale` (uniform) or
 * `scale.z`, `filters.0.threshold`, `components.0.speed`, `light.intensity`, `params.count` (a plugin node type's). A
 * new filter, component, light parameter, plugin node type or parameter in the contract needs no panel code.
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
  return spec ? specRows(`components.${index}`, spec.params) : [];
};

/** The rows of a light node (`light.{name}`), from `LIGHT_PARAMS` */
export const lightRows = (): ValueRow[] => specRows("light", LIGHT_PARAMS);

/** The rows of a plugin's node type (`params.{name}` – the values sit in the node's params next to the placement), from its spec */
export const nodeTypeRows = (type: string): ValueRow[] => {
  const spec = nodeTypeSpec(type);
  return spec ? specRows("params", spec.params) : [];
};

/** One row per parameter of a spec (a component's – built-in or a plugin's –, a pass's or the light's), ids `{prefix}.{name}` */
const specRows = (prefix: string, params: Record<string, ComponentParamSpec>): ValueRow[] =>
  Object.entries(params).map(([name, param]): ValueRow => {
    const id = `${prefix}.${name}`;
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

/** The rows of a post-processing pass (`passes.{i}.{name}`), from its spec; a type the editor does not know has none */
export const passRows = (pass: PassData, index: number): ValueRow[] => {
  const spec: PassSpec | undefined = (PASSES as Record<string, PassSpec>)[pass.type];
  return spec ? specRows(`passes.${index}`, spec.params) : [];
};

/** The words a pass's choice row shows for its options (`{type}.{name}`); an option without one shows its value */
const PASS_OPTION_LABELS: Record<string, Record<string, string>> = {
  "grade.reach": { ar: "AR layer", all: "whole picture" },
};

export const passOptionLabels = (pass: PassData, row: ValueRow): Record<string, string> =>
  PASS_OPTION_LABELS[`${pass.type}.${row.id.split(".")[2]}`] ?? {};

/** The value a pass shows for a row: the value set, else the spec's default */
export const passValue = (pass: PassData, row: ValueRow): RowValue => {
  const name = row.id.split(".")[2];
  const value = pass[name];
  return value === undefined ? row.default : (value as RowValue);
};

/** A pass with one value changed (a row's); a value equal to the default is dropped from the data */
export const setPassValue = (pass: PassData, row: ValueRow, value: RowValue): PassData => {
  const name = row.id.split(".")[2];
  const next = { ...pass };
  if (sameValue(value, row.default)) delete next[name];
  else next[name] = value;
  return next;
};

/** The component types a node of `type` may take */
export const componentTypesFor = (type: EntityData["type"]): string[] =>
  componentTypes().filter(key => {
    const nodeTypes = componentSpec(key)?.nodeTypes as readonly string[] | undefined;
    return !nodeTypes || nodeTypes.includes(type);
  });

export const valueRows = (entity: EntityData, uniformScale: boolean): ValueRow[] => [
  ...placementRows(entity, uniformScale),
  ...(entity.type === "light" ? lightRows() : []),
  ...nodeTypeRows(entity.type),
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
  if (head === "light") {
    const value = entity.light?.[second as keyof LightData];
    return (value as RowValue | undefined) ?? row.default;
  }
  if (head === "params") {
    const value = entity.params?.[second];
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
  if (head === "light") return { ...entity, light: { ...entity.light, [second]: value } };
  if (head === "params") return { ...entity, params: { ...entity.params, [second]: row.kind === "boolean" ? value === "true" : value } };
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
  // A plugin node type's parameters only where they differ from its spec's defaults
  nodeTypeRows(entity.type).forEach(row => {
    const name = row.id.split(".")[1];
    if (params[name] === undefined) return;
    const value = getValue(entity, row);
    if (sameValue(value, row.default)) delete params[name];
    else params[name] = row.kind === "boolean" ? value === "true" : typeof value === "number" ? round(value) : value;
  });
  if (!sameVector(placement.position, defaults.position)) params.position = placement.position.map(round);
  if (!sameVector(placement.rotation, defaults.rotation)) params.rotation = placement.rotation.map(round);
  if (!sameVector(placement.scale, defaults.scale)) {
    params.scale = uniformScale && isUniform(placement.scale) ? round(placement.scale[0]) : placement.scale.map(round);
  }
  const result: EntityData = { ...entity };
  // The name (schema 2.12) trimmed, none when empty
  const name = entity.name?.trim();
  if (name) result.name = name;
  else delete result.name;
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
  if (entity.type === "light") {
    // The light's values only where they differ from the defaults; none left = no `light` key
    const light: Record<string, unknown> = {};
    lightRows().forEach(row => {
      const name = row.id.split(".")[1];
      const value = getValue(entity, row);
      if (!sameValue(value, row.default)) light[name] = typeof value === "number" ? round(value) : value;
    });
    if (Object.keys(light).length) result.light = light as LightData;
    else delete result.light;
  } else {
    delete result.light;
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

/** A file's picture size in pixels as the library knows it (null: not known) */
export interface FileSize {
  width: number | null;
  height: number | null;
}

/**
 * The uniform scale a new video node starts with. The engine's video plane is one target width wide and as high as the
 * file's proportions, so a portrait file would stand taller than the target is wide: its node is scaled so the plane
 * stays within one target width both ways. Undefined – the default size – for a landscape or square file and when the
 * file's size is not known.
 */
export const videoNodeScale = (size?: FileSize | null): number | undefined => {
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  if (!(width > 0) || !(height > 0) || width >= height) return undefined;
  return Math.round((width / height) * 10000) / 10000;
};

/**
 * A new node of the type with its file; a video sized to its file when the library knows the file's size (`size`). A
 * plugin's node type (#77) takes its file when its spec names a `src`; its parameters start at their defaults.
 */
export const newNode = (type: EntityData["type"], asset?: { id: string; assetType: AssetData["assetType"]; src: string }, size?: FileSize | null): EntityData => {
  const scale = type === "video" && asset ? videoNodeScale(size) : undefined;
  return {
    type,
    assets: asset ? [asset] : [],
    ...(scale !== undefined ? { params: { scale } } : {}),
    ...(type === "text" ? { text: "{{entry.title}}", color: "#ffffff" } : {}),
  };
};
