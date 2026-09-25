/**
 * Chroma key for AR videos: one key color (e.g. neon green or purple) in the video becomes transparent
 * – no alpha channel needed in the video file (works for MP4/H.264 on iOS and Android).
 *
 * Algorithm: the widely used OBS / three.js-forum chroma key (Mugen87). Colors are compared by their
 * chroma (UV of YUV), not RGB, so darker and lighter shades of the key color are removed too.
 *   similarity – how close to the key color a pixel must be to become transparent
 *   smoothness – width of the soft edge
 *   spill      – removes the key color's tint on edges (desaturates towards grey)
 *
 * Content: `entity.params.chromaKey: { color, similarity?, smoothness?, spill? }` on a video entity.
 */

export const CHROMA_KEY_SHADER = "chroma-key";

export interface ChromaKey {
  color: string;
  similarity: number;
  smoothness: number;
  spill: number;
}

/**
 * similarity 0.3 (not OBS's 0.4): grey/white sit ~0.45 (purple) to ~0.53 (green) from the key in
 * chroma space, so 0.4 made white semi-transparent with a purple key (measured in the browser).
 * Colors near the key in chroma are removed too (e.g. blue with a purple key) – neon green is the
 * safest key color for artwork with skin tones and blues.
 */
export const CHROMA_KEY_DEFAULTS: Omit<ChromaKey, "color"> = {
  similarity: 0.3,
  smoothness: 0.08,
  spill: 0.1,
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const unit = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

/** `entity.params` → chroma key settings, or undefined when the video has none / an invalid color */
export const parseChromaKey = (params?: Record<string, unknown>): ChromaKey | undefined => {
  const raw = params?.chromaKey;
  if (typeof raw !== "object" || raw === null) return undefined;
  const { color, similarity, smoothness, spill } = raw as Record<string, unknown>;
  if (typeof color !== "string" || !HEX_COLOR.test(color)) {
    console.warn(`[ChromaKey] Invalid key color ${JSON.stringify(color)} – expected "#rrggbb"`);
    return undefined;
  }
  return {
    color,
    similarity: unit(similarity, CHROMA_KEY_DEFAULTS.similarity),
    // 0 would divide by zero in the shader
    smoothness: Math.max(0.001, unit(smoothness, CHROMA_KEY_DEFAULTS.smoothness)),
    spill: Math.max(0.001, unit(spill, CHROMA_KEY_DEFAULTS.spill)),
  };
};

/** A-Frame `material` attribute for a keyed video */
export const chromaKeyMaterial = (videoAssetId: string, key: ChromaKey): string =>
  `shader: ${CHROMA_KEY_SHADER}; src: #${videoAssetId}; color: ${key.color}; ` +
  `similarity: ${key.similarity}; smoothness: ${key.smoothness}; spill: ${key.spill}; transparent: true; side: double`;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D src;
uniform vec3 color;
uniform float similarity;
uniform float smoothness;
uniform float spill;
varying vec2 vUv;

vec2 RGBtoUV(vec3 rgb) {
  return vec2(
    rgb.r * -0.169 + rgb.g * -0.331 + rgb.b *  0.5   + 0.5,
    rgb.r *  0.5   + rgb.g * -0.419 + rgb.b * -0.081 + 0.5
  );
}

void main() {
  vec4 rgba = texture2D(src, vUv);
  float chromaDistance = distance(RGBtoUV(rgba.rgb), RGBtoUV(color));

  float baseMask = chromaDistance - similarity;
  rgba.a = pow(clamp(baseMask / smoothness, 0.0, 1.0), 1.5);

  float spillValue = pow(clamp(baseMask / spill, 0.0, 1.0), 1.5);
  float desaturated = clamp(rgba.r * 0.2126 + rgba.g * 0.7152 + rgba.b * 0.0722, 0.0, 1.0);
  rgba.rgb = mix(vec3(desaturated), rgba.rgb, spillValue);

  gl_FragColor = rgba;
  #include <colorspace_fragment>
}
`;

/**
 * Register the A-Frame shader once (before any scene uses it). A-Frame turns `src` (type map) into a
 * texture – a VideoTexture for a <video> – and `color` into a THREE.Color (linear with color
 * management, like the texture samples).
 */
export const registerChromaKeyShader = (): void => {
  const aframe = (window as unknown as { AFRAME?: typeof AFRAME }).AFRAME;
  if (!aframe || aframe.shaders[CHROMA_KEY_SHADER]) return;

  aframe.registerShader(CHROMA_KEY_SHADER, {
    schema: {
      src: { type: "map", is: "uniform" },
      color: { type: "color", is: "uniform", default: "#00ff00" },
      similarity: { type: "number", is: "uniform", default: CHROMA_KEY_DEFAULTS.similarity },
      smoothness: { type: "number", is: "uniform", default: CHROMA_KEY_DEFAULTS.smoothness },
      spill: { type: "number", is: "uniform", default: CHROMA_KEY_DEFAULTS.spill },
    },
    vertexShader,
    fragmentShader,
  });
};
