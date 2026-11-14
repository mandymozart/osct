import { lookOf } from "@engine/scene/celebration";
import { type Appearance, APPEARANCE_TYPES, DEFAULT_APPEARANCE_TYPE, isBuiltInAppearanceType, SHAPE_EASINGS } from "@shared/types/appearance";
import { DEMO_LOOK, REVEAL_CODE_LOOK } from "./demo-plugin";
import { EASINGS, EASING_LABELS, type Easing } from "./easing";

/**
 * What the sandbox tunes: the values of a sandbox concept (`RevealParams`), the engine's own look (`EngineParams` –
 * a built-in look of the content's contract, `shared/types/appearance.ts`, which names and measures its values as the
 * sandbox does), the scene around the entity, and for each of them the controls the panel builds (`Spec`).
 */

/** Where a pattern's value (0 → 1) comes from: what is revealed first has the lowest value */
export const PATTERNS = ["noise", "rise", "radial", "across"] as const;
export type Pattern = (typeof PATTERNS)[number];
export const MASKS = ["none", ...PATTERNS, "dither"] as const;
export type Mask = (typeof MASKS)[number];

export interface RevealParams {
  /** ms: the appear animation; the disappear animation is the same, rewound */
  duration: number;
  outDuration: number;

  /** Which fragments exist: none (all), or a front moving through a pattern */
  mask: Mask;
  maskInvert: boolean;
  /** Share of the duration the front moves in */
  maskStart: number;
  maskEnd: number;
  maskEase: Easing;
  /** Noise mixed into a geometric pattern (0 = a clean line, 1 = noise alone) */
  maskNoise: number;
  /** Noise waves across the object */
  waves: number;
  /** Width of the glowing edge at the front (pattern units, 0 = none): from … to … while the front moves */
  edgeStart: number;
  edgeEnd: number;
  edgeColor: string;
  /** > 1 = brighter than white: it blooms */
  edgeIntensity: number;
  /** The band behind the edge that still shines in the glow colour */
  glowWidth: number;
  glow: number;
  glowColor: string;

  /** Height at the start as a share of the real one (1 = off, 0 = flat on the page) */
  heightFrom: number;
  /** The axis that inflates: the page normal, or one of the page's own axes */
  inflateAxis: "normal" | "x" | "y";
  inflateOrigin: "base" | "centre";
  /** Size at the start (1 = off) */
  scaleFrom: number;
  /** Turns around the page normal on the way in */
  spin: number;
  /** Offset along the page normal at the start, in target widths */
  lift: number;
  shapeStart: number;
  shapeEnd: number;
  shapeEase: Easing;
  overshoot: number;
  /** How far the pattern delays the shape per vertex (0 = all at once) */
  stagger: number;
  staggerBy: Pattern;

  /** Share of the duration the opacity takes from 0 to 1 (0 = opaque from the start) */
  fade: number;
  /** Colour over the surface at the start (0 = none), gone at `tintEnd` */
  tint: number;
  tintColor: string;
  tintEnd: number;

  sparks: number;
  sparkColor: string;
  sparkSize: number;
  sparkDistance: number;
  bloom: number;
}

export const DEFAULT_REVEAL: RevealParams = {
  duration: 700,
  outDuration: 500,
  mask: "none",
  maskInvert: false,
  maskStart: 0,
  maskEnd: 1,
  maskEase: "smooth",
  maskNoise: 0.2,
  waves: 3,
  edgeStart: 0,
  edgeEnd: 0,
  edgeColor: "#f3cc94",
  edgeIntensity: 1.3,
  glowWidth: 0.2,
  glow: 0,
  glowColor: "#f3cc94",
  heightFrom: 1,
  inflateAxis: "normal",
  inflateOrigin: "base",
  scaleFrom: 1,
  spin: 0,
  lift: 0,
  shapeStart: 0,
  shapeEnd: 1,
  shapeEase: "out",
  overshoot: 1,
  stagger: 0,
  staggerBy: "radial",
  fade: 0,
  tint: 0,
  tintColor: "#f5e7c8",
  tintEnd: 0.6,
  sparks: 0,
  sparkColor: "#f3cc94",
  sparkSize: 0.05,
  sparkDistance: 0.3,
  bloom: 0,
};

/** The engine's look as the sandbox edits it, and the named look it started from */
export type EngineParams = Appearance & { look: string };

/**
 * A look as the panel's values: a built-in one's type and defaults; the demo plugin's look keeps the built-in values
 * in the panel (its code plays, with the panel's two durations)
 */
export const engineLook = (name: string): EngineParams => {
  if (name === REVEAL_CODE_LOOK) return { ...lookOf({ type: DEFAULT_APPEARANCE_TYPE })!, look: name };
  if (name === DEMO_LOOK) return { ...lookOf({ type: DEFAULT_APPEARANCE_TYPE })!, look: name, duration: 800, outDuration: 500 };
  const look = isBuiltInAppearanceType(name) ? name : DEFAULT_APPEARANCE_TYPE;
  return { look, ...lookOf({ type: look })! };
};

export interface SceneParams {
  /** The phone's camera: vertical field of view, °  */
  fov: number;
  /** Camera around the page: 0° tilt = straight from above, yaw turns around the page normal */
  tilt: number;
  yaw: number;
  /** In target widths */
  distance: number;
  /** A hand's shake, 0 = a tripod */
  wobble: number;
  viewport: "phone" | "fill";
  background: string;
  page: boolean;
  pageColor: string;
}

export const DEFAULT_SCENE: SceneParams = {
  fov: 60,
  tilt: 38,
  yaw: 0,
  distance: 3.2,
  wobble: 0.3,
  viewport: "phone",
  background: "#3a3632",
  page: true,
  pageColor: "#e8e2d4",
};

/** The entity's `params` in the content: position (target widths), rotation (°, XYZ), scale */
export interface PlacementParams {
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number;
  scale: number;
}

/** The engine's default for a model: standing on the page, half a target width per model unit */
export const ENGINE_PLACEMENT: PlacementParams = { px: 0, py: 0, pz: 0, rx: 90, ry: 0, rz: 0, scale: 0.5 };

// ── Controls ──

export type Spec =
  | { key: string; label: string; kind: "range"; min: number; max: number; step: number; unit?: string; help?: string }
  | { key: string; label: string; kind: "color"; help?: string }
  | { key: string; label: string; kind: "select"; options: ReadonlyArray<readonly [string, string]>; help?: string }
  | { key: string; label: string; kind: "toggle"; help?: string };

export interface SpecSection {
  title: string;
  specs: Spec[];
  /** Closed at first */
  closed?: boolean;
}

const easings = EASINGS.map(name => [name, EASING_LABELS[name]] as const);
const patterns = [["noise", "noise"], ["rise", "rising from the page"], ["radial", "from the centre"], ["across", "across the page"]] as const;
const share = { min: 0, max: 1, step: 0.01 } as const;

export const REVEAL_SECTIONS: SpecSection[] = [
  {
    title: "Timing",
    specs: [
      { key: "duration", label: "Appear", kind: "range", min: 100, max: 4000, step: 10, unit: "ms" },
      { key: "outDuration", label: "Disappear", kind: "range", min: 100, max: 4000, step: 10, unit: "ms", help: "The same animation, rewound" },
    ],
  },
  {
    title: "Shape",
    specs: [
      { key: "heightFrom", label: "Height from", kind: "range", ...share, help: "0 = flat on the page, 1 = no inflate" },
      { key: "inflateAxis", label: "Axis", kind: "select", options: [["normal", "page normal"], ["x", "page x"], ["y", "page y"]] },
      { key: "inflateOrigin", label: "Grows from", kind: "select", options: [["base", "base"], ["centre", "centre"]] },
      { key: "scaleFrom", label: "Scale from", kind: "range", min: 0, max: 2, step: 0.01, help: "1 = no scale" },
      { key: "spin", label: "Spin", kind: "range", min: -2, max: 2, step: 0.05, unit: "turns" },
      { key: "lift", label: "Lift", kind: "range", min: -1, max: 1, step: 0.01, unit: "widths", help: "Start offset along the page normal" },
      { key: "shapeStart", label: "Start", kind: "range", ...share },
      { key: "shapeEnd", label: "End", kind: "range", ...share },
      { key: "shapeEase", label: "Easing", kind: "select", options: easings },
      { key: "overshoot", label: "Overshoot", kind: "range", min: 0, max: 3, step: 0.05, help: "For the overshoot and elastic easings" },
      { key: "stagger", label: "Stagger", kind: "range", ...share, help: "The pattern delays the shape per vertex: a wave instead of all at once" },
      { key: "staggerBy", label: "Stagger by", kind: "select", options: patterns },
    ],
  },
  {
    title: "Mask",
    specs: [
      { key: "mask", label: "Pattern", kind: "select", options: [["none", "none"], ...patterns, ["dither", "dither (screen)"]] },
      { key: "maskInvert", label: "Invert", kind: "toggle" },
      { key: "maskStart", label: "Start", kind: "range", ...share },
      { key: "maskEnd", label: "End", kind: "range", ...share },
      { key: "maskEase", label: "Easing", kind: "select", options: easings },
      { key: "maskNoise", label: "Noise mix", kind: "range", ...share, help: "Noise in a geometric pattern: 0 = a clean line" },
      { key: "waves", label: "Noise waves", kind: "range", min: 0.5, max: 12, step: 0.1 },
    ],
  },
  {
    title: "Edge and glow",
    specs: [
      { key: "edgeStart", label: "Edge from", kind: "range", min: 0, max: 0.4, step: 0.005 },
      { key: "edgeEnd", label: "Edge to", kind: "range", min: 0, max: 0.4, step: 0.005 },
      { key: "edgeColor", label: "Edge colour", kind: "color" },
      { key: "edgeIntensity", label: "Edge intensity", kind: "range", min: 0, max: 4, step: 0.05, help: "Above 1 it blooms" },
      { key: "glow", label: "Glow", kind: "range", ...share },
      { key: "glowWidth", label: "Glow width", kind: "range", min: 0, max: 1, step: 0.01 },
      { key: "glowColor", label: "Glow colour", kind: "color" },
    ],
  },
  {
    title: "Surface",
    specs: [
      { key: "fade", label: "Fade in", kind: "range", ...share, help: "Share of the time the opacity takes; 0 = opaque" },
      { key: "tint", label: "Tint", kind: "range", ...share },
      { key: "tintColor", label: "Tint colour", kind: "color" },
      { key: "tintEnd", label: "Tint gone at", kind: "range", ...share },
    ],
  },
  {
    title: "Sparks and bloom",
    specs: [
      { key: "sparks", label: "Sparks", kind: "range", min: 0, max: 2000, step: 50 },
      { key: "sparkColor", label: "Spark colour", kind: "color" },
      { key: "sparkSize", label: "Spark size", kind: "range", min: 0.005, max: 0.2, step: 0.005 },
      { key: "sparkDistance", label: "Spark flight", kind: "range", min: 0, max: 1.5, step: 0.01 },
      { key: "bloom", label: "Bloom", kind: "range", min: 0, max: 2, step: 0.05 },
    ],
  },
];

/** The engine's look: the sandbox's controls for the values the engine has, with the choices it knows */
const engineKeys = new Set(Object.keys(lookOf({ type: DEFAULT_APPEARANCE_TYPE })!));
const engineSpec = (spec: Spec): Spec =>
  spec.kind !== "select" ? spec
    : spec.key === "mask" ? { ...spec, options: [["none", "none"], ["noise", "noise"]] }
    : spec.key === "shapeEase" ? { ...spec, options: SHAPE_EASINGS.map(name => [name, EASING_LABELS[name]] as const) }
    : spec;

export const ENGINE_SECTIONS: SpecSection[] = [
  {
    title: "Look",
    specs: [{
      key: "look", label: "Look", kind: "select",
      options: [
        ...APPEARANCE_TYPES.map(name => [name, name] as const),
        [REVEAL_CODE_LOOK, `${REVEAL_CODE_LOOK} (plugin: the built-in as code)`] as const,
        [DEMO_LOOK, `${DEMO_LOOK} (a plugin's)`] as const,
      ],
      help: "The type a book names in its appearance: a built-in look (choosing one takes its values), or a plugin's – its code plays and only the two durations apply",
    }],
  },
  ...REVEAL_SECTIONS
    .map(section => ({ ...section, specs: section.specs.filter(spec => engineKeys.has(spec.key)).map(engineSpec) }))
    .filter(section => section.specs.length > 0),
];

export const SCENE_SECTION: SpecSection = {
  title: "Scene",
  closed: true,
  specs: [
    { key: "viewport", label: "Viewport", kind: "select", options: [["phone", "phone 360 × 780"], ["fill", "fill"]] },
    { key: "fov", label: "Field of view", kind: "range", min: 30, max: 90, step: 1, unit: "°" },
    { key: "tilt", label: "Tilt", kind: "range", min: 0, max: 85, step: 1, unit: "°", help: "0 = straight from above; drag on the stage" },
    { key: "yaw", label: "Turn", kind: "range", min: -180, max: 180, step: 1, unit: "°" },
    { key: "distance", label: "Distance", kind: "range", min: 0.8, max: 10, step: 0.05, unit: "widths", help: "Wheel or pinch on the stage" },
    { key: "wobble", label: "Hand shake", kind: "range", min: 0, max: 1, step: 0.05 },
    { key: "background", label: "Background", kind: "color", help: "Stands in for the camera picture" },
    { key: "page", label: "Page", kind: "toggle" },
    { key: "pageColor", label: "Paper", kind: "color" },
  ],
};

export const PLACEMENT_SECTION: SpecSection = {
  title: "Placement",
  closed: true,
  specs: [
    { key: "scale", label: "Scale", kind: "range", min: 0.01, max: 3, step: 0.005, help: "Target widths per model unit" },
    { key: "rx", label: "Rotation x", kind: "range", min: -180, max: 180, step: 1, unit: "°", help: "90 = standing on the page" },
    { key: "ry", label: "Rotation y", kind: "range", min: -180, max: 180, step: 1, unit: "°" },
    { key: "rz", label: "Rotation z", kind: "range", min: -180, max: 180, step: 1, unit: "°" },
    { key: "px", label: "Position x", kind: "range", min: -1, max: 1, step: 0.01 },
    { key: "py", label: "Position y", kind: "range", min: -1, max: 1, step: 0.01 },
    { key: "pz", label: "Position z", kind: "range", min: -1, max: 1, step: 0.01 },
  ],
};

/** The gold palette of the reader (`main.css` --gold-1 … --gold-4), white and black: quick picks beside every colour */
export const SWATCHES = ["#f5e7c8", "#7f6032", "#d2ae5a", "#f3cc94", "#ffffff", "#000000"];

// ── Paths ("reveal.ms") into a params object ──

export const getPath = (object: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], object);

export const setPath = (object: unknown, path: string, value: unknown): void => {
  const keys = path.split(".");
  const last = keys.pop()!;
  const owner = keys.reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], object) as Record<string, unknown>;
  owner[last] = value;
};

/** `saved` over `defaults`, key by key and only where the type matches – an older saved state never breaks a newer page */
export const merged = <T>(defaults: T, saved: unknown): T => {
  if (typeof defaults !== "object" || defaults === null) return typeof saved === typeof defaults ? (saved as T) : defaults;
  const source = (typeof saved === "object" && saved !== null ? saved : {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  Object.entries(defaults as Record<string, unknown>).forEach(([key, value]) => (result[key] = merged(value, source[key])));
  return result as T;
};
