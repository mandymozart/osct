/**
 * Video filters (Tilman 2026-09-26): a video entity carries `filters: [{ type, ...parameters }]`,
 * applied in order. Each filter type is defined once here – its parameters with kind, default, range
 * and a description. The client builds the shader's uniforms from it, the content build and the
 * config guard check the YAML against it, missing values get the defaults.
 *
 * Adding a filter: define it in FILTERS, implement its shader in the client
 * (`client/src/components/ar-bridges/utils/`), document it in docs/content.md.
 */

export type FilterParamSpec =
  | { kind: "color"; default: string; description: string }
  | { kind: "number"; default: number; min: number; max: number; description: string;
      /** Different default when a chroma key runs in luma mode (brightness has another scale) */
      lumaDefault?: number }
  | { kind: "choice"; options: readonly string[]; default: string; description: string };

export interface FilterSpec {
  description: string;
  params: Record<string, FilterParamSpec>;
}

export const FILTERS = {
  chromaKey: {
    description:
      "Makes one color of the video transparent – a colored background (neon green is safest) or pure black/white.",
    params: {
      color: {
        kind: "color", default: "#00ff00",
        description: "Key color (#rrggbb) that becomes transparent.",
      },
      mode: {
        kind: "choice", options: ["auto", "chroma", "luma"], default: "auto",
        description:
          "chroma compares the color tone (for green, purple, …), luma the brightness (for black, white). " +
          "auto: luma for neutral colors (black, grey, white), chroma otherwise.",
      },
      threshold: {
        kind: "number", default: 0.3, lumaDefault: 0.06, min: 0, max: 1,
        description: "How close to the key color a pixel must be to disappear. Higher = more is removed.",
      },
      softness: {
        kind: "number", default: 0.08, lumaDefault: 0.1, min: 0.001, max: 1,
        description: "Width of the soft edge between transparent and visible. Higher = softer, more see-through edges.",
      },
      spill: {
        kind: "number", default: 0.1, min: 0.001, max: 1,
        description: "Removes the key color's tint on edges (chroma only). Higher = more grey on edges.",
      },
      opacity: {
        kind: "number", default: 1, min: 0, max: 1,
        description: "Opacity of the whole video after keying. 1 = fully visible.",
      },
    },
  },
} as const satisfies Record<string, FilterSpec>;

export type FilterType = keyof typeof FILTERS;
export const FILTER_TYPES = Object.keys(FILTERS) as FilterType[];

export const isFilterType = (value: unknown): value is FilterType =>
  typeof value === "string" && value in FILTERS;

/** A filter as written in the content and stored in the game configuration (unset params = defaults) */
export interface FilterData {
  type: FilterType;
  [param: string]: string | number;
}

/** Problems of one `filters` list, as "<path>: <message>" – empty when it is valid */
export const filterProblems = (raw: unknown, path: string): string[] => {
  if (!Array.isArray(raw)) return [`${path}: expected a list of filters`];
  const problems: string[] = [];
  raw.forEach((filter, i) => {
    const at = `${path}[${i}]`;
    if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
      problems.push(`${at}: expected { type, ...parameters }`);
      return;
    }
    const { type, ...params } = filter as Record<string, unknown>;
    if (!isFilterType(type)) {
      problems.push(`${at}.type: "${type}" is not one of ${FILTER_TYPES.join(", ")}`);
      return;
    }
    const specs: Record<string, FilterParamSpec> = FILTERS[type].params;
    for (const [name, value] of Object.entries(params)) {
      const spec = specs[name];
      if (!spec) {
        problems.push(`${at}.${name}: unknown parameter of ${type} (${Object.keys(specs).join(", ")})`);
      } else if (spec.kind === "color" && !(typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))) {
        problems.push(`${at}.${name}: expected a color "#rrggbb", got ${JSON.stringify(value)}`);
      } else if (spec.kind === "choice" && !spec.options.includes(value as string)) {
        problems.push(`${at}.${name}: expected one of ${spec.options.join(", ")}, got ${JSON.stringify(value)}`);
      } else if (spec.kind === "number" && !(typeof value === "number" && value >= spec.min && value <= spec.max)) {
        problems.push(`${at}.${name}: expected a number from ${spec.min} to ${spec.max}, got ${JSON.stringify(value)}`);
      }
    }
  });
  return problems;
};
