import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Material,
  Matrix4,
  type Mesh,
  type Object3D,
  Points,
  ShaderMaterial,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { ease, EASING_GLSL, EASINGS } from "./easing";
import { MASKS, PATTERNS, type RevealParams } from "./params";

/**
 * The sandbox's own appear / disappear animation: one shader injection that covers every sandbox concept, driven by
 * `RevealParams`. Built like the engine's celebration (`engine/src/scene/celebration.ts`) so a concept that wins moves
 * there without a new idea: the entity's materials are cloned with the injection, the originals come back at the end.
 *
 * Two spaces: the **entity's** (its own object – the noise, as in the engine) and the **anchor's** (the page: x right,
 * y to the top of the page, z out of it, 1 unit = the target's width) – shape and geometric patterns live there, so
 * "flat on the page" means the page whatever way the model is turned.
 *
 *   shape   – per vertex: the height along an axis from `heightFrom` to 1 (the inflate), scale, spin, lift; the
 *             stagger delays it by a pattern
 *   mask    – per fragment: a front moves through a pattern (noise, rising, from the centre, across, dither);
 *             what it has not reached is discarded, the edge glows, the band behind it shines
 *   surface – tint and opacity
 *
 * Skinned meshes are deformed in their bind pose (fine for a look, not for the engine).
 */

export interface Runner {
  /** Show the animation at `tau` (0 → 1) of a phase: `in` appears, `out` disappears */
  play(phase: "in" | "out", tau: number): void;
  /** ms */
  duration(phase: "in" | "out"): number;
  /** Bloom strength wanted right now */
  readonly bloom: number;
  /** The entity was placed anew: measure it again */
  refit(): void;
  /** Values changed in a way a running animation cannot follow: start again at the next `play` */
  invalidate(): void;
  dispose(): void;
}

/** 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) → about −1…1 */
const NOISE_GLSL = /* glsl */ `
vec3 rvMod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 rvMod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 rvPermute(vec4 x) { return rvMod289(((x * 34.0) + 10.0) * x); }
vec4 rvTaylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float rvNoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = rvMod289(i);
  vec4 p = rvPermute(rvPermute(rvPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = rvTaylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/**
 * A pattern's value at a point, 0 → 1 (`e`: the entity's space, `a`: the anchor's): 0 noise · 1 rising from the page ·
 * 2 from the centre of the base · 3 across the page – a geometric one with `noiseMix` of noise in it
 */
const PATTERN_GLSL = /* glsl */ `
uniform float uRvFreq;
uniform vec3 uRvBoxMin;
uniform vec3 uRvBoxSize;
uniform vec3 uRvPivot;
uniform float uRvReach;
float rvPattern(int kind, vec3 e, vec3 a, float noiseMix) {
  float n = (kind == 0 || noiseMix > 0.0) ? 0.5 + 0.5 * rvNoise(e * uRvFreq) : 0.0;
  if (kind == 0) return n;
  vec3 b = (a - uRvBoxMin) / uRvBoxSize;
  float v = kind == 1 ? b.z : kind == 2 ? length(a - uRvPivot) / uRvReach : b.x;
  return mix(clamp(v, 0.0, 1.0), n, noiseMix);
}
`;

/** The shape of a point of the anchor's space at the shape's progress – shared by the meshes and the sparks */
const DEFORM_GLSL = /* glsl */ `
uniform float uRvShapeT;
uniform float uRvStagger;
uniform int uRvStaggerBy;
uniform int uRvShapeEase;
uniform float uRvOvershoot;
uniform float uRvHeightFrom;
uniform vec3 uRvAxis;
uniform float uRvAxisBase;
uniform float uRvScaleFrom;
uniform float uRvSpin;
uniform float uRvLift;
vec3 rvDeform(vec3 a, vec3 e) {
  float delay = uRvStagger > 0.0 ? rvPattern(uRvStaggerBy, e, a, 0.0) : 0.0;
  float k = rvEase(uRvShapeEase, uRvShapeT * (1.0 + uRvStagger) - delay * uRvStagger, uRvOvershoot);
  // Never quite flat: coplanar faces would flicker
  float height = max(0.004, uRvHeightFrom + (1.0 - uRvHeightFrom) * k);
  float along = dot(a, uRvAxis);
  a += uRvAxis * (uRvAxisBase + (along - uRvAxisBase) * height - along);
  a = uRvPivot + (a - uRvPivot) * max(0.0, uRvScaleFrom + (1.0 - uRvScaleFrom) * k);
  float angle = uRvSpin * 6.2831853 * (1.0 - k);
  vec2 d = a.xy - uRvPivot.xy;
  a.xy = uRvPivot.xy + vec2(cos(angle) * d.x - sin(angle) * d.y, sin(angle) * d.x + cos(angle) * d.y);
  a.z += uRvLift * (1.0 - k);
  return a;
}
`;

const VERTEX_HEAD = /* glsl */ `
uniform mat4 uRvToEntity;
uniform mat4 uRvToAnchor;
uniform mat4 uRvFromAnchor;
varying vec3 vRvEntity;
varying vec3 vRvAnchor;
${NOISE_GLSL}${EASING_GLSL}${PATTERN_GLSL}${DEFORM_GLSL}`;

const FRAGMENT_HEAD = /* glsl */ `
uniform int uRvMask;
uniform float uRvMaskInvert;
uniform float uRvMaskNoise;
uniform float uRvMaskP;
uniform float uRvEdge;
uniform vec3 uRvEdgeColor;
uniform float uRvGlow;
uniform float uRvGlowWidth;
uniform vec3 uRvGlowColor;
uniform float uRvTint;
uniform vec3 uRvTintColor;
uniform float uRvOpacity;
varying vec3 vRvEntity;
varying vec3 vRvAnchor;
${NOISE_GLSL}${PATTERN_GLSL}`;

/** Appended to the fragment shader's main: the mask with its edge and glow, then tint and opacity */
const FRAGMENT_TAIL = /* glsl */ `
  if (uRvMask >= 0) {
    // Dither: interleaved gradient noise over the screen – a fade without transparency
    float rvM = uRvMask == 4
      ? fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))
      : rvPattern(uRvMask, vRvEntity, vRvAnchor, uRvMaskNoise);
    if (uRvMaskInvert > 0.5) rvM = 1.0 - rvM;
    float rvBehind = uRvMaskP - rvM;
    if (rvBehind < 0.0) discard;
    float rvG = 1.0 - smoothstep(uRvEdge, uRvEdge + uRvGlowWidth, rvBehind);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uRvGlowColor, uRvGlow * rvG * rvG);
    if (rvBehind < uRvEdge) gl_FragColor = vec4(uRvEdgeColor, 1.0);
  }
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uRvTintColor, uRvTint);
  gl_FragColor.a *= uRvOpacity;
}`;

const inject = (
  shader: Pick<WebGLProgramParametersWithUniforms, "vertexShader" | "fragmentShader" | "uniforms">,
  uniforms: Record<string, { value: unknown }>,
): void => {
  Object.assign(shader.uniforms, uniforms);
  const deform = /* glsl */ `
  vRvEntity = (uRvToEntity * vec4(position, 1.0)).xyz;
  vec4 rvAnchor = uRvToAnchor * vec4(position, 1.0);
  vRvAnchor = rvAnchor.xyz;`;
  shader.vertexShader = VERTEX_HEAD + (shader.vertexShader.includes("#include <begin_vertex>")
    ? shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>${deform}
  transformed = (uRvFromAnchor * vec4(rvDeform(rvAnchor.xyz, vRvEntity), 1.0)).xyz;`)
    // A shader of its own (a video's chroma key): the mask and the surface, no shape
    : shader.vertexShader.replace("void main() {", `void main() {${deform}`));
  shader.fragmentShader = `${FRAGMENT_HEAD}\n${shader.fragmentShader}`.replace(/\}\s*$/, FRAGMENT_TAIL);
};

const SPARK_VERTEX = /* glsl */ `
uniform mat4 uRvToAnchor;
uniform mat4 uRvFromAnchor;
uniform int uRvMask;
uniform float uRvMaskInvert;
uniform float uRvMaskNoise;
uniform float uRvSparkP;
uniform float uRvSparkSize;
uniform float uRvSparkDistance;
uniform float uRvViewportHalfHeight;
attribute vec3 aDirection;
attribute float aRandom;
varying float vLife;
${NOISE_GLSL}${EASING_GLSL}${PATTERN_GLSL}${DEFORM_GLSL}
void main() {
  vec3 a = (uRvToAnchor * vec4(position, 1.0)).xyz;
  // Born when the mask's front passes its point – without a mask, spread over the shape's time
  float born = fract(aRandom * 7.13);
  if (uRvMask >= 0 && uRvMask < 4) {
    born = rvPattern(uRvMask, position, a, uRvMaskNoise);
    if (uRvMaskInvert > 0.5) born = 1.0 - born;
  }
  float life = (uRvSparkP - born) / (0.25 + 0.2 * aRandom);
  vLife = life;
  vec3 direction = normalize(mat3(uRvToAnchor) * aDirection);
  vec3 p = rvDeform(a, position) + direction * (1.0 - pow(1.0 - clamp(life, 0.0, 1.0), 3.0)) * uRvSparkDistance * (0.4 + aRandom);
  mat4 anchorView = modelViewMatrix * uRvFromAnchor;
  vec4 mvPosition = anchorView * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float visible = step(0.0, life) * step(life, 1.0);
  // Perspective size: uRvSparkSize is in target widths
  gl_PointSize = visible * uRvSparkSize * length(anchorView[0].xyz) * projectionMatrix[1][1] * uRvViewportHalfHeight / -mvPosition.z
    * (0.5 + aRandom) * (1.0 - life);
}
`;

const SPARK_FRAGMENT = /* glsl */ `
uniform vec3 uRvSparkColor;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float edge = clamp(1.0 - d * 2.0, 0.0, 1.0);
  if (edge <= 0.0) discard;
  // Brighter than white while young: the sparks bloom too
  gl_FragColor = vec4(uRvSparkColor * (2.5 - 2.0 * vLife), edge * edge * (1.0 - vLife));
}
`;

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const span = (t: number, from: number, to: number) => (to > from ? Math.min(1, Math.max(0, (t - from) / (to - from))) : t >= to ? 1 : 0);

/** The meshes of an object, each with its matrix into another object's space */
const meshesIn = (object: Object3D, space: Object3D): Array<{ mesh: Mesh; matrix: Matrix4 }> => {
  space.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(space.matrixWorld).invert();
  const meshes: Array<{ mesh: Mesh; matrix: Matrix4 }> = [];
  object.traverse(child => {
    const mesh = child as Mesh;
    if (mesh.isMesh && mesh.geometry?.getAttribute("position")) meshes.push({ mesh, matrix: new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld) });
  });
  return meshes;
};

/** The object's box in the anchor's space, from its vertices (a box of boxes would be too large for a turned model) */
export const anchorBounds = (anchor: Object3D, object: Object3D): Box3 => {
  const box = new Box3();
  const point = new Vector3();
  meshesIn(object, anchor).forEach(({ mesh, matrix }) => {
    const position = mesh.geometry.getAttribute("position");
    const step = Math.max(1, Math.floor(position.count / 20000));
    for (let i = 0; i < position.count; i += step) box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(matrix));
  });
  if (box.isEmpty()) box.set(new Vector3(-0.5, -0.5, 0), new Vector3(0.5, 0.5, 1));
  return box;
};

/**
 * Start the sandbox animation of `entity` (the placement group below `anchor`; its first child is the entity's own
 * object, as in the engine). It reads `params` at every `play`, so the panel tunes a running animation.
 */
export const startReveal = (anchor: Object3D, entity: Object3D, params: RevealParams, viewportHeight: () => number): Runner => {
  const root = entity.children[0] ?? entity;

  const shared = {
    uRvFreq: { value: 1 },
    uRvBoxMin: { value: new Vector3() },
    uRvBoxSize: { value: new Vector3(1, 1, 1) },
    uRvPivot: { value: new Vector3() },
    uRvReach: { value: 1 },
    uRvShapeT: { value: 0 },
    uRvStagger: { value: 0 },
    uRvStaggerBy: { value: 0 },
    uRvShapeEase: { value: 0 },
    uRvOvershoot: { value: 1 },
    uRvHeightFrom: { value: 1 },
    uRvAxis: { value: new Vector3(0, 0, 1) },
    uRvAxisBase: { value: 0 },
    uRvScaleFrom: { value: 1 },
    uRvSpin: { value: 0 },
    uRvLift: { value: 0 },
    uRvMask: { value: -1 },
    uRvMaskInvert: { value: 0 },
    uRvMaskNoise: { value: 0 },
    uRvMaskP: { value: 0 },
    uRvEdge: { value: 0 },
    uRvEdgeColor: { value: new Color() },
    uRvGlow: { value: 0 },
    uRvGlowWidth: { value: 0.001 },
    uRvGlowColor: { value: new Color() },
    uRvTint: { value: 0 },
    uRvTintColor: { value: new Color() },
    uRvOpacity: { value: 1 },
  };

  // Materials: a clone per mesh with the injection; the originals come back at the end
  const swapped = meshesIn(root, anchor).map(({ mesh }) => {
    const own = { uRvToEntity: { value: new Matrix4() }, uRvToAnchor: { value: new Matrix4() }, uRvFromAnchor: { value: new Matrix4() } };
    const original = mesh.material;
    const clones = (Array.isArray(original) ? original : [original]).map(material => {
      const clone = material.clone();
      if (material instanceof ShaderMaterial && clone instanceof ShaderMaterial) clone.uniforms = { ...material.uniforms };
      const previous = material.onBeforeCompile;
      clone.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        inject(shader, { ...shared, ...own });
      };
      clone.customProgramCacheKey = () => `sandbox-reveal-${material.customProgramCacheKey()}`;
      return clone;
    });
    mesh.material = Array.isArray(original) ? clones : clones[0];
    return { mesh, original, clones, own };
  });

  const sparkUniforms = {
    ...shared,
    uRvToAnchor: { value: new Matrix4() },
    uRvFromAnchor: { value: new Matrix4() },
    uRvSparkP: { value: 0 },
    uRvSparkSize: { value: 0.05 },
    uRvSparkDistance: { value: 0.3 },
    uRvSparkColor: { value: new Color() },
    uRvViewportHalfHeight: { value: 400 },
  };
  let sparks: { points: Points; geometry: BufferGeometry; material: ShaderMaterial; count: number } | null = null;

  const dropSparks = () => {
    if (!sparks) return;
    sparks.points.removeFromParent();
    sparks.geometry.dispose();
    sparks.material.dispose();
    sparks = null;
  };

  /** Points on the surface with their normals, in the entity's space – children of its own object */
  const buildSparks = (count: number) => {
    dropSparks();
    if (count <= 0) return;
    const meshes = meshesIn(root, root);
    const positions: number[] = [];
    const directions: number[] = [];
    const randoms: number[] = [];
    const position = new Vector3();
    const normal = new Vector3();
    let seed = 1;
    const random = () => {
      const x = Math.sin(seed++ * 12.9898) * 43758.5453; // deterministic
      return x - Math.floor(x);
    };
    const perMesh = Math.max(1, Math.floor(count / Math.max(1, meshes.length)));
    for (const { mesh, matrix } of meshes) {
      let sampler: MeshSurfaceSampler;
      try {
        sampler = new MeshSurfaceSampler(mesh);
        (sampler as unknown as { setRandomGenerator(fn: () => number): void }).setRandomGenerator(random);
        sampler.build();
      } catch {
        continue; // no triangles
      }
      const hasNormals = !!mesh.geometry.getAttribute("normal");
      const normalMatrix = new Matrix4().copy(matrix).invert().transpose();
      for (let i = 0; i < perMesh; i++) {
        if (hasNormals) sampler.sample(position, normal);
        else {
          sampler.sample(position);
          normal.set(0, 0, 1);
        }
        position.applyMatrix4(matrix);
        normal.transformDirection(normalMatrix).add(new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.8)).normalize();
        positions.push(position.x, position.y, position.z);
        directions.push(normal.x, normal.y, normal.z);
        randoms.push(random());
      }
    }
    if (!positions.length) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("aDirection", new BufferAttribute(new Float32Array(directions), 3));
    geometry.setAttribute("aRandom", new BufferAttribute(new Float32Array(randoms), 1));
    const material = new ShaderMaterial({
      uniforms: sparkUniforms,
      vertexShader: SPARK_VERTEX,
      fragmentShader: SPARK_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    root.add(points);
    sparks = { points, geometry, material, count };
  };

  /** Measure the entity on its anchor: the matrices between the spaces, its box on the page, the noise's scale */
  const refit = () => {
    const toRoot = meshesIn(root, root);
    const toAnchor = meshesIn(root, anchor);
    swapped.forEach(({ mesh, own }) => {
      const a = toAnchor.find(entry => entry.mesh === mesh);
      const e = toRoot.find(entry => entry.mesh === mesh);
      if (!a || !e) return;
      own.uRvToEntity.value.copy(e.matrix);
      own.uRvToAnchor.value.copy(a.matrix);
      own.uRvFromAnchor.value.copy(a.matrix).invert();
    });
    anchor.updateWorldMatrix(true, true);
    sparkUniforms.uRvToAnchor.value.copy(anchor.matrixWorld).invert().multiply(root.matrixWorld);
    sparkUniforms.uRvFromAnchor.value.copy(sparkUniforms.uRvToAnchor.value).invert();

    const box = anchorBounds(anchor, root);
    const size = box.getSize(new Vector3());
    shared.uRvBoxMin.value.copy(box.min);
    shared.uRvBoxSize.value.set(Math.max(size.x, 1e-4), Math.max(size.y, 1e-4), Math.max(size.z, 1e-4));
    // The centre of the footprint on the page: what scale and spin turn around, where "from the centre" starts
    const pivot = shared.uRvPivot.value.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z);
    shared.uRvReach.value = Math.max(1e-4, pivot.distanceTo(new Vector3(box.max.x, box.max.y, box.max.z)));
    // As the engine: the same number of noise waves on every object, in the entity's own units
    const rootBox = new Box3();
    const point = new Vector3();
    toRoot.forEach(({ mesh, matrix }) => {
      const position = mesh.geometry.getAttribute("position");
      const step = Math.max(1, Math.floor(position.count / 20000));
      for (let i = 0; i < position.count; i += step) rootBox.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(matrix));
    });
    rootSize = Math.max(1e-3, rootBox.isEmpty() ? 1 : rootBox.getSize(new Vector3()).length());
  };
  let rootSize = 1;
  refit();

  let bloom = 0;
  let disposed = false;

  const apply = (t: number) => {
    const p = params;
    // Shape
    const box = { min: shared.uRvBoxMin.value, size: shared.uRvBoxSize.value };
    const axis = p.inflateAxis === "x" ? 0 : p.inflateAxis === "y" ? 1 : 2;
    shared.uRvAxis.value.set(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
    shared.uRvAxisBase.value = box.min.getComponent(axis) + (p.inflateOrigin === "centre" ? box.size.getComponent(axis) / 2 : 0);
    shared.uRvShapeT.value = span(t, p.shapeStart, p.shapeEnd);
    shared.uRvStagger.value = p.stagger;
    shared.uRvStaggerBy.value = PATTERNS.indexOf(p.staggerBy);
    shared.uRvShapeEase.value = EASINGS.indexOf(p.shapeEase);
    shared.uRvOvershoot.value = p.overshoot;
    shared.uRvHeightFrom.value = p.heightFrom;
    shared.uRvScaleFrom.value = p.scaleFrom;
    shared.uRvSpin.value = p.spin;
    shared.uRvLift.value = p.lift;

    // Mask: the front runs from before the pattern's start to past its end, edge and glow included
    const masked = p.mask !== "none";
    const m = ease(p.maskEase, span(t, p.maskStart, p.maskEnd));
    const edge = p.edgeStart + (p.edgeEnd - p.edgeStart) * m;
    const reach = 1.001 + Math.max(p.edgeStart, p.edgeEnd) + (p.glow > 0 ? p.glowWidth : 0);
    shared.uRvMask.value = masked ? MASKS.indexOf(p.mask) - 1 : -1;
    shared.uRvMaskInvert.value = p.maskInvert ? 1 : 0;
    shared.uRvMaskNoise.value = p.maskNoise;
    shared.uRvMaskP.value = -0.001 + (reach + 0.001) * m;
    shared.uRvFreq.value = p.waves / rootSize;
    shared.uRvEdge.value = edge;
    shared.uRvEdgeColor.value.set(p.edgeColor).multiplyScalar(p.edgeIntensity);
    shared.uRvGlow.value = p.glow;
    shared.uRvGlowWidth.value = Math.max(p.glowWidth, 1e-3);
    shared.uRvGlowColor.value.set(p.glowColor);

    // Surface
    shared.uRvTint.value = p.tint * (1 - smooth(span(t, 0, p.tintEnd)));
    shared.uRvTintColor.value.set(p.tintColor);
    const opacity = p.fade > 0 ? smooth(t / p.fade) : 1;
    shared.uRvOpacity.value = opacity;
    swapped.forEach(({ clones }) => clones.forEach(clone => {
      const transparent = p.fade > 0 && opacity < 1;
      if (clone.transparent !== transparent) {
        clone.transparent = transparent;
        clone.needsUpdate = true;
      }
    }));

    // Sparks: with the mask's front, and on for a while after it has passed; without a mask over the shape's time
    if ((sparks?.count ?? 0) !== p.sparks) buildSparks(p.sparks);
    const after = 0.45 * span(t, masked ? p.maskEnd : p.shapeEnd, 1);
    sparkUniforms.uRvSparkP.value = (masked ? shared.uRvMaskP.value : span(t, p.shapeStart, p.shapeEnd)) + after;
    sparkUniforms.uRvSparkSize.value = p.sparkSize;
    sparkUniforms.uRvSparkDistance.value = p.sparkDistance;
    sparkUniforms.uRvSparkColor.value.set(p.sparkColor);
    sparkUniforms.uRvViewportHalfHeight.value = viewportHeight() / 2;
    if (sparks) sparks.points.visible = t > 0 && t < 1;

    // Bloom: rises fast, holds, fades towards the end
    bloom = t <= 0 || t >= 1 ? 0 : p.bloom * smooth(t / 0.15) * (1 - smooth((t - 0.7) / 0.3));
  };

  return {
    get bloom() {
      return bloom;
    },
    duration: phase => (phase === "in" ? params.duration : params.outDuration),
    play(phase, tau) {
      if (disposed) return;
      apply(phase === "in" ? tau : 1 - tau);
    },
    refit,
    invalidate: () => {},
    dispose() {
      if (disposed) return;
      disposed = true;
      swapped.forEach(({ mesh, original, clones }) => {
        mesh.material = original;
        clones.forEach((clone: Material) => clone.dispose());
      });
      dropSparks();
      bloom = 0;
    },
  };
};
