import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  Material,
  Matrix4,
  Mesh,
  Object3D,
  Points,
  ShaderMaterial,
  Vector3,
  WebGLProgramParametersWithUniforms,
} from "three";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

/**
 * Appear / disappear animations of an AR entity – the Codrops emissive dissolve (Jatin Chopra,
 * "Implementing a Dissolve Effect with Shaders and Particles in Three.js", 2025 –
 * github.com/JatinChopra/emissive-dissolve-effect, MIT):
 *
 *   noise = snoise(position × frequency) × amplitude;  noise < progress → discarded;
 *   progress ≤ noise < progress + edge → the glowing edge (HDR gold, picked up by the bloom).
 *
 * Three kinds (Tilman 2026-09-26):
 *   - `unlock` (first find): the entity materialises – progress from positive (nothing) to negative
 *     (everything), a wide gold edge narrowing, gold glow behind it, sparks from the surface, gold bloom.
 *   - `reveal` (every later find): the same dissolve, plain – no colour, no sparks, no bloom, quick.
 *   - `outro` (target lost): the reveal rewound – the entity dissolves away, then the anchor hides.
 * Works for every entity type (model, video / image plane, chroma key): the entity's materials are cloned
 * for the animation (model materials are shared with the cached asset) with the dissolve injected
 * (onBeforeCompile); the originals come back afterwards.
 */

export type AnimationKind = "unlock" | "reveal" | "outro";

/** The parameters to play with (units: noise × amplitude; the object's size is ~3 noise waves) */
export const DISSOLVE = {
  /** Noise waves across the object (frequency = WAVES / object size) */
  waves: 3,
  amplitude: 1,
  /** Progress: from START (nothing visible) to END (everything visible); unlock runs on to TAIL (sparks) */
  progressStart: 0.85,
  progressEnd: -1.05,
  progressTail: -1.9,
  /**
   * Colours from the gold palette (main.css --gold-1 … --gold-4). Edge colour × intensity (> 1 = brighter
   * than white: only the edge and the sparks bloom – the bloom is gold, too)
   */
  edgeColor: new Color(0xf3cc94), // --gold-4: on screen a pale gold-white core, the bloom around it gold
  edgeIntensity: 1.3,
  glowColor: new Color(0xf3cc94), // --gold-4
  sparks: 700,
  sparkColors: [0xf5e7c8, 0x7f6032, 0xd2ae5a, 0xf3cc94], // --gold-1 … --gold-4
};

interface AnimationPreset {
  ms: number;
  /** Share of the time for (de)materialising (eased); unlock: the rest lets sparks and glow fade */
  materialise: number;
  /** Edge width (wide at the start, narrow at the end); 0 = no coloured edge */
  edgeStart: number;
  edgeEnd: number;
  /** Freshly materialised areas behind the edge glow gold over this range; 0 = no glow */
  glowWidth: number;
  sparks: boolean;
  /** Bloom strength (ArView adds it over the camera image) – rises fast, holds, fades with the glow */
  bloomStrength: number;
  /** outro: from visible to nothing */
  reverse: boolean;
}

export const ANIMATIONS: Record<AnimationKind, AnimationPreset> = {
  unlock: { ms: 4200, materialise: 0.72, edgeStart: 0.15, edgeEnd: 0.03, glowWidth: 0.4, sparks: true, bloomStrength: 1.0, reverse: false },
  reveal: { ms: 1000, materialise: 1, edgeStart: 0, edgeEnd: 0, glowWidth: 0, sparks: false, bloomStrength: 0, reverse: false },
  outro: { ms: 700, materialise: 1, edgeStart: 0, edgeEnd: 0, glowWidth: 0, sparks: false, bloomStrength: 0, reverse: true },
};

/** The unlock's length (the found indicator's label runs alongside) */
export const CELEBRATION_MS = ANIMATIONS.unlock.ms;

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) → about −1…1 */
const NOISE_GLSL = /* glsl */ `
vec3 dsMod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 dsMod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 dsPermute(vec4 x) { return dsMod289(((x * 34.0) + 10.0) * x); }
vec4 dsTaylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float dsNoise(vec3 v) {
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
  i = dsMod289(i);
  vec4 p = dsPermute(dsPermute(dsPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
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
  vec4 norm = dsTaylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/** Uniforms shared by the entity's materials and its sparks */
export interface DissolveUniforms {
  uFreq: { value: number };
  uAmp: { value: number };
  uProgress: { value: number };
  uEdge: { value: number };
  uEdgeColor: { value: Color };
  uGlowWidth: { value: number };
  uGlowColor: { value: Color };
  /** 0–1: strength of the gold glow behind the edge (fades out once the object is complete) */
  uGlow: { value: number };
}

/**
 * Add the dissolve to a material's shaders: a position in the entity's space (`uToEntity` – the same for
 * every mesh of the entity, so the noise is continuous over the whole object), fragments below the progress
 * are discarded, the edge band glows (HDR), the band behind it shines gold and cools down.
 */
export const injectDissolve = (
  shader: Pick<WebGLProgramParametersWithUniforms, "vertexShader" | "fragmentShader" | "uniforms">,
  uniforms: DissolveUniforms,
  toEntity: Matrix4,
): void => {
  Object.assign(shader.uniforms, uniforms, { uToEntity: { value: toEntity } });
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", "uniform mat4 uToEntity;\nvarying vec3 vDissolvePosition;\nvoid main() {\n  vDissolvePosition = (uToEntity * vec4(position, 1.0)).xyz;");
  const declarations = [
    "uniform float uFreq;", "uniform float uAmp;", "uniform float uProgress;", "uniform float uEdge;",
    "uniform vec3 uEdgeColor;", "uniform float uGlowWidth;", "uniform vec3 uGlowColor;", "uniform float uGlow;",
    "varying vec3 vDissolvePosition;",
  ].join("\n");
  shader.fragmentShader = `${declarations}\n${NOISE_GLSL}\n${shader.fragmentShader}`.replace(/\}\s*$/, `
  float dissolveNoise = dsNoise(vDissolvePosition * uFreq) * uAmp;
  if (dissolveNoise < uProgress) discard;
  // Freshly materialised areas shine gold and cool down behind the edge
  float dissolveGlow = 1.0 - smoothstep(uProgress, uProgress + uGlowWidth, dissolveNoise);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uGlowColor, uGlow * 0.8 * dissolveGlow * dissolveGlow);
  // The edge (brighter than white – it blooms)
  if (dissolveNoise < uProgress + uEdge) gl_FragColor = vec4(uEdgeColor, 1.0);
}`);
};

const sparkVertexShader = /* glsl */ `
uniform float uFreq;
uniform float uAmp;
uniform float uProgress;
uniform float uSize;
uniform float uDistance;
uniform float uViewportHalfHeight;
attribute vec3 aDirection;
attribute float aRandom;
attribute vec3 aColor;
varying float vLife;
varying vec3 vColor;
${NOISE_GLSL}
void main() {
  // Born when the edge passes its point on the surface (progress drops below its noise), flies off, fades
  float born = dsNoise(position * uFreq) * uAmp - uProgress;
  float life = born / (0.45 + 0.35 * aRandom);
  vLife = life;
  vColor = aColor;
  vec3 p = position + aDirection * (1.0 - pow(1.0 - clamp(life, 0.0, 1.0), 3.0)) * uDistance * (0.4 + aRandom);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float visible = step(0.0, life) * step(life, 1.0);
  // Perspective size: uSize is in the entity's units (the model-view matrix scales them)
  float viewScale = length(modelViewMatrix[0].xyz);
  gl_PointSize = visible * uSize * viewScale * projectionMatrix[1][1] * uViewportHalfHeight / -mvPosition.z
    * (0.5 + aRandom) * (1.0 - life);
}
`;

const sparkFragmentShader = /* glsl */ `
varying float vLife;
varying vec3 vColor;
void main() {
  // Round, soft dot (no pow() of a negative number – undefined on some mobile GPUs)
  float d = length(gl_PointCoord - vec2(0.5));
  float edge = clamp(1.0 - d * 2.0, 0.0, 1.0);
  if (edge <= 0.0) discard;
  float glow = edge * edge;
  // Brighter than white while young: the sparks bloom too
  gl_FragColor = vec4(vColor * (2.5 - 2.0 * vLife), glow * (1.0 - vLife));
}
`;

/** Sparks on the entity's surface: positions and flight directions (normals) in the entity's space */
const sampleSparks = (meshes: Array<{ mesh: Mesh; toEntity: Matrix4 }>): BufferGeometry | null => {
  const positions: number[] = [];
  const directions: number[] = [];
  const colors: number[] = [];
  const randoms: number[] = [];
  const position = new Vector3();
  const normal = new Vector3();
  const color = new Color();
  const perMesh = Math.max(1, Math.floor(DISSOLVE.sparks / Math.max(1, meshes.length)));
  let seed = 1;
  const random = () => {
    const x = Math.sin(seed++ * 12.9898) * 43758.5453; // deterministic
    return x - Math.floor(x);
  };
  for (const { mesh, toEntity } of meshes) {
    const positionAttribute = mesh.geometry.getAttribute("position");
    if (!positionAttribute || positionAttribute.count < 3) continue;
    const hasNormals = !!mesh.geometry.getAttribute("normal");
    let sampler: MeshSurfaceSampler;
    try {
      sampler = new MeshSurfaceSampler(mesh);
      // Deterministic sparks (the method exists, @types/three lacks it)
      (sampler as unknown as { setRandomGenerator(fn: () => number): void }).setRandomGenerator(random);
      sampler.build();
    } catch {
      continue; // e.g. no triangles
    }
    const normalMatrix = new Matrix4().copy(toEntity).invert().transpose();
    for (let i = 0; i < perMesh; i++) {
      if (hasNormals) sampler.sample(position, normal);
      else {
        sampler.sample(position);
        normal.set(0, 0, 1);
      }
      position.applyMatrix4(toEntity);
      normal.transformDirection(normalMatrix);
      // Mostly along the surface normal, a little random
      normal.add(new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.8)).normalize();
      positions.push(position.x, position.y, position.z);
      directions.push(normal.x, normal.y, normal.z);
      color.set(DISSOLVE.sparkColors[i % DISSOLVE.sparkColors.length]);
      colors.push(color.r, color.g, color.b);
      randoms.push(random());
    }
  }
  if (!positions.length) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aDirection", new BufferAttribute(new Float32Array(directions), 3));
  geometry.setAttribute("aColor", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute("aRandom", new BufferAttribute(new Float32Array(randoms), 1));
  return geometry;
};

export interface Celebration {
  readonly kind: AnimationKind;
  /** Advance by `delta` seconds – false once it is done and cleaned up */
  update(delta: number): boolean;
  /** Bloom strength wanted right now (the view adds the bloom while any animation wants it) */
  readonly bloom: number;
  /** End now: originals back, sparks removed (e.g. the spread changes, the target is found again) */
  finish(): void;
}

/**
 * Start an animation of `entity` (the placement group; its first child is the entity's own object).
 * `outro` ends with the entity fully dissolved – hide it before its materials come back.
 */
export const celebrate = (_anchor: Object3D, entity: Object3D, kind: AnimationKind = "unlock"): Celebration => {
  const preset = ANIMATIONS[kind];
  const root = entity.children[0] ?? entity;
  root.updateWorldMatrix(true, true);
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();

  // Size of the entity → frequency: the same number of noise waves on every object
  const box = new Box3().setFromObject(root);
  box.applyMatrix4(rootInverse);
  const size = Math.max(1e-3, box.getSize(new Vector3()).length());

  const from = preset.reverse ? DISSOLVE.progressEnd : DISSOLVE.progressStart;
  const to = preset.reverse ? DISSOLVE.progressStart : DISSOLVE.progressEnd;
  const uniforms: DissolveUniforms = {
    uFreq: { value: DISSOLVE.waves / size },
    uAmp: { value: DISSOLVE.amplitude },
    uProgress: { value: from },
    uEdge: { value: preset.edgeStart },
    uEdgeColor: { value: DISSOLVE.edgeColor.clone().multiplyScalar(DISSOLVE.edgeIntensity) },
    uGlowWidth: { value: Math.max(preset.glowWidth, 1e-3) },
    uGlowColor: { value: DISSOLVE.glowColor },
    uGlow: { value: preset.glowWidth > 0 ? 1 : 0 },
  };

  // Materials: a clone per mesh with the dissolve; the originals come back at the end
  const swapped: Array<{ mesh: Mesh; original: Material | Material[]; clones: Material[] }> = [];
  const meshes: Array<{ mesh: Mesh; toEntity: Matrix4 }> = [];
  root.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const toEntity = new Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    meshes.push({ mesh, toEntity });
    const original = mesh.material;
    const clones = (Array.isArray(original) ? original : [original]).map(material => {
      const clone = material.clone();
      if (material instanceof ShaderMaterial && clone instanceof ShaderMaterial) {
        clone.uniforms = { ...material.uniforms }; // keep the same textures (clone() would copy them)
      }
      clone.onBeforeCompile = shader => injectDissolve(shader, uniforms, toEntity);
      clone.customProgramCacheKey = () => `dissolve-${material.customProgramCacheKey()}`;
      return clone;
    });
    mesh.material = Array.isArray(original) ? clones : clones[0];
    swapped.push({ mesh, original, clones });
  });

  // Sparks (unlock only) in the entity's space – children of its own object: they follow tracking and placement
  const sparkGeometry = preset.sparks ? sampleSparks(meshes) : null;
  const sparkMaterial = sparkGeometry && new ShaderMaterial({
    uniforms: {
      uFreq: uniforms.uFreq,
      uAmp: uniforms.uAmp,
      uProgress: uniforms.uProgress,
      uSize: { value: 0.06 * size },
      uDistance: { value: 0.35 * size },
      uViewportHalfHeight: { value: (window.innerHeight * Math.min(window.devicePixelRatio, 2)) / 2 },
    },
    vertexShader: sparkVertexShader,
    fragmentShader: sparkFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const sparks = sparkGeometry && sparkMaterial ? new Points(sparkGeometry, sparkMaterial) : null;
  if (sparks) {
    sparks.frustumCulled = false;
    root.add(sparks);
  }

  let elapsed = 0;
  let bloom = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    swapped.forEach(({ mesh, original, clones }) => {
      mesh.material = original;
      clones.forEach(clone => clone.dispose());
    });
    sparks?.removeFromParent();
    sparkGeometry?.dispose();
    sparkMaterial?.dispose();
    bloom = 0;
  };

  return {
    kind,
    get bloom() {
      return bloom;
    },
    finish,
    update(delta: number): boolean {
      // At most one 30 fps frame per step: the first unlock compiles the dissolve shaders (a stall of a few
      // hundred ms on phones) – the animation waits instead of jumping past the materialisation
      elapsed += Math.min(delta, 1 / 30) * 1000;
      const t = Math.min(1, elapsed / preset.ms);
      if (t < preset.materialise || preset.materialise >= 1) {
        const m = smoothstep(t / preset.materialise);
        uniforms.uProgress.value = from + (to - from) * m;
        uniforms.uEdge.value = preset.edgeStart + (preset.edgeEnd - preset.edgeStart) * m;
        bloom = preset.bloomStrength * smoothstep(t / (preset.materialise * 0.15)); // rises fast, then holds
      } else {
        // Unlock only: past the materialisation the last sparks fly out, glow and bloom fade
        const f = (t - preset.materialise) / (1 - preset.materialise);
        uniforms.uProgress.value = to + (DISSOLVE.progressTail - to) * f;
        uniforms.uEdge.value = preset.edgeEnd;
        uniforms.uGlow.value = 1 - smoothstep(f);
        bloom = preset.bloomStrength * (1 - smoothstep(f));
      }
      if (t < 1) return true;
      finish();
      return false;
    },
  };
};
