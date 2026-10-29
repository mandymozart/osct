/**
 * Post-processing passes (content schema 2.5): effects over the whole rendered AR image – a bloom, a vignette, a colour
 * grade, a shader of the book's own. A spread names them as `passes: [{ type, ...parameters }]`, run in order on
 * the image the scene rendered, before it lies over the camera picture; the book's `passes` are the default for
 * every spread without a list of its own (an empty list turns them off). Like the components, every built-in type
 * is defined once here – its parameters with kind, default, range and a description – so the editor's rows, the
 * content build, the config guard and the engine read one definition. A plugin's pass (`registerPass`) brings its
 * own spec; the build and the guard accept such a type only where plugins are declared.
 *
 * Adding a built-in pass: define it in PASSES, implement it in the engine (`engine/src/scene/post/`), document it in
 * docs/content.md.
 */

import { ComponentParamSpec, paramProblems } from "./components";

export interface PassSpec {
  description: string;
  params: Record<string, ComponentParamSpec>;
}

export const PASSES = {
  /** Bright parts glow: the part of the image above a threshold is blurred and added back as light */
  bloom: {
    description: "Bright parts of the image glow – blurred and added back as light over everything, the camera picture included.",
    params: {
      strength: { kind: "number", default: 1, min: 0, max: 3, step: 0.05, description: "How much light the glow adds." },
      radius: { kind: "number", default: 0.4, min: 0, max: 1, step: 0.05, description: "How far the glow spreads." },
      threshold: { kind: "number", default: 0.85, min: 0, max: 1, step: 0.01, description: "Brightness from which a pixel glows (1 = only brighter than white)." },
    },
  },
  /** The edges of the picture darken (or take a colour) – the camera picture included */
  vignette: {
    description: "The edges of the picture fade to a colour (black by default) – the AR layer and the camera picture alike.",
    params: {
      strength: { kind: "number", default: 0.6, min: 0, max: 1, step: 0.01, description: "How dark the edges get (1 = fully the colour)." },
      radius: { kind: "number", default: 0.6, min: 0, max: 1.5, step: 0.01, description: "Distance from the centre where the fade begins (1 = the sides)." },
      softness: { kind: "number", default: 0.6, min: 0.01, max: 1.5, step: 0.01, description: "How wide the fade is." },
      color: { kind: "color", default: "#000000", description: "The colour the edges fade to." },
    },
  },
  /**
   * Colour grading – of the AR layer alone (`reach: ar`) or of the whole picture (`reach: all`, schema 2.9): in the
   * editor the desk too, on the phone the camera picture (the engine's camera renderer draws it with the same grade)
   */
  grade: {
    description: "Colour grading – exposure, contrast, saturation and a tint. Of the AR layer alone, or of the whole picture with the camera picture.",
    params: {
      reach: {
        kind: "choice", options: ["ar", "all"], default: "ar",
        description: "What is graded: ar = the AR layer alone (the camera picture keeps its colours), all = the whole picture, the camera picture included.",
      },
      exposure: { kind: "number", default: 0, min: -2, max: 2, step: 0.05, unit: "EV", description: "Brighter (+) or darker (−) in stops." },
      contrast: { kind: "number", default: 1, min: 0, max: 2, step: 0.05, description: "1 = as rendered, 0 = flat grey, 2 = hard." },
      saturation: { kind: "number", default: 1, min: 0, max: 2, step: 0.05, description: "1 = as rendered, 0 = black and white." },
      tint: { kind: "color", default: "#ffffff", description: "Multiplied into the colours (white = none)." },
    },
  },
} as const satisfies Record<string, PassSpec>;

export type BuiltInPassType = keyof typeof PASSES;
export const PASS_TYPES = Object.keys(PASSES) as BuiltInPassType[];
export const isBuiltInPassType = (value: unknown): value is BuiltInPassType => typeof value === "string" && value in PASSES;

/** A pass as the content holds it: its type and the parameters set (missing ones use the spec's defaults) */
export interface PassData {
  type: string;
  [param: string]: unknown;
}

export interface PassCheckOptions {
  /** The spec of a type that is not built in (a plugin's) – `undefined` = unknown */
  spec?: (type: string) => PassSpec | undefined;
  /** What an unknown type is: refused (the default – nothing would render it) or allowed (a plugin registers it at load) */
  unknownTypes?: "refuse" | "allow";
  /**
   * What a parameter the spec does not have is: refused (the default – the build, the API) or ignored (the app's
   * guard since 2.9: a parameter a newer MINOR adds is left to the newer app)
   */
  unknownParams?: "refuse" | "ignore";
}

/** The spec of a pass type: built in, or from `options.spec` */
export const passSpec = (type: string, options: PassCheckOptions = {}): PassSpec | undefined =>
  isBuiltInPassType(type) ? PASSES[type] : options.spec?.(type);

/** Problems of a `passes` list (the content build, the guard, the API) */
export const passProblems = (raw: unknown, path: string, options: PassCheckOptions = {}): string[] => {
  if (!Array.isArray(raw)) return [`${path}: expected a list of passes`];
  const problems: string[] = [];
  raw.forEach((pass, i) => {
    const at = `${path}[${i}]`;
    if (typeof pass !== "object" || pass === null || Array.isArray(pass)) {
      problems.push(`${at}: expected { type, ...parameters }`);
      return;
    }
    const { type, ...params } = pass as Record<string, unknown>;
    if (typeof type !== "string" || !type) {
      problems.push(`${at}.type: expected a pass type (${PASS_TYPES.join(", ")})`);
      return;
    }
    const spec = passSpec(type, options);
    if (!spec) {
      if (options.unknownTypes !== "allow") problems.push(`${at}.type: "${type}" is not one of ${PASS_TYPES.join(", ")}`);
      return;
    }
    const known = options.unknownParams === "ignore" ? Object.fromEntries(Object.entries(params).filter(([name]) => name in spec.params)) : params;
    problems.push(...paramProblems(spec.params, known, at, type));
  });
  return problems;
};

/** A pass's parameters with every one resolved to its value or the spec's default */
export const resolvePass = (spec: PassSpec, pass: PassData): Record<string, unknown> => {
  const resolved: Record<string, unknown> = {};
  for (const [name, param] of Object.entries(spec.params)) {
    resolved[name] = pass[name] !== undefined ? pass[name] : param.default;
  }
  return resolved;
};
