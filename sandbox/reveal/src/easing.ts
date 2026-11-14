/**
 * Easings, twice: for the timeline in TypeScript and for the per-vertex stagger in GLSL – the same curves under the
 * same numbers. `overshoot` scales how far `back` swings past its end (1 = the classic 10 %).
 */

export const EASINGS = ["linear", "smooth", "out", "inOut", "in", "back", "elastic"] as const;
export type Easing = (typeof EASINGS)[number];

export const EASING_LABELS: Record<Easing, string> = {
  linear: "linear",
  smooth: "smooth",
  out: "ease out",
  inOut: "in-out",
  in: "ease in",
  back: "overshoot",
  elastic: "elastic",
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export const ease = (name: Easing, x: number, overshoot = 1): number => {
  const t = clamp01(x);
  switch (name) {
    case "linear": return t;
    case "smooth": return t * t * (3 - 2 * t);
    case "out": return 1 - (1 - t) ** 3;
    case "inOut": return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    case "in": return t * t * t;
    case "back": {
      const c = 1.70158 * overshoot;
      return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
    }
    case "elastic":
      return t === 0 || t === 1 ? t : 1 + overshoot * 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3));
  }
};

export const EASING_GLSL = /* glsl */ `
float rvEase(int kind, float x, float overshoot) {
  float t = clamp(x, 0.0, 1.0);
  if (kind == 0) return t;
  if (kind == 1) return t * t * (3.0 - 2.0 * t);
  if (kind == 2) return 1.0 - pow(1.0 - t, 3.0);
  if (kind == 3) return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  if (kind == 4) return t * t * t;
  if (kind == 5) {
    float c = 1.70158 * overshoot;
    float u = t - 1.0;
    return 1.0 + (c + 1.0) * u * u * u + c * u * u;
  }
  if (t <= 0.0 || t >= 1.0) return t;
  return 1.0 + overshoot * pow(2.0, -10.0 * t) * sin((t * 10.0 - 0.75) * 2.0943951);
}
`;
