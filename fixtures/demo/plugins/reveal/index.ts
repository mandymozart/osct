import type { PluginApi } from "osct-plugin-api";

/**
 * A look, written as code: the engine's built-in `inflateDissolve` – the default way an entity appears – as a plugin, to
 * copy and change. Shows `registerAppearance` (plugin API 1.8): the factory runs once per animation and returns
 * `{ duration, update(visible), dispose }`; `visible` runs from 0 to 1 when the entity appears (the first find, `reveal`,
 * and every later one, `found`) and from 1 to 0 when the page is lost (`lost`) – so one function covers the three
 * moments, and the animation goes out the way it came in.
 *
 * Pick it as `revealCode` for a moment (the book's appearance, or the reveal / found / lost component of a node). Its
 * parameters are the rows the spec below declares; the values of the built-in look, the same names.
 *
 * Three parts, each over its own share of the time: shape (flat on the page, small and turned, rising into place),
 * mask (a front moves through 3D noise; the edge glows, the band behind it shines – a shader injected into copies of the
 * materials) and sparks (points on the surface that fly off where the front passes).
 */

/** 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) → about −1…1 */
const NOISE_GLSL = /* glsl */ `
vec3 rcMod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 rcMod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 rcPermute(vec4 x) { return rcMod289(((x * 34.0) + 10.0) * x); }
vec4 rcTaylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float rcNoise(vec3 v) {
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
  i = rcMod289(i);
  vec4 p = rcPermute(rcPermute(rcPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
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
  vec4 norm = rcTaylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/** The mask in a material's fragment shader: below the front nothing is drawn, the edge and the band behind it glow */
const FRAGMENT_TAIL = /* glsl */ `
  float rcValue = rcNoise(vRevealPosition * uFreq);
  if (rcValue < uProgress) discard;
  float rcGlow = 1.0 - smoothstep(uProgress + uEdge, uProgress + uEdge + uGlowWidth, rcValue);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uGlowColor, uGlow * rcGlow * rcGlow);
  if (rcValue < uProgress + uEdge) gl_FragColor = vec4(uEdgeColor, 1.0);
}`;

const SPARK_VERTEX = /* glsl */ `
uniform float uFreq;
uniform float uSparkProgress;
uniform float uSize;
uniform float uDistance;
uniform float uViewportHalfHeight;
uniform mat4 uRest;
uniform mat4 uShape;
attribute vec3 aDirection;
attribute float aRandom;
varying float vLife;
${NOISE_GLSL}
void main() {
  // Born when the front passes its point on the surface, flies off, fades
  float born = 0.5 - 0.5 * rcNoise(position * uFreq);
  float life = (uSparkProgress - born) / (0.25 + 0.2 * aRandom);
  vLife = life;
  // It starts on the surface as the entity is shaped right now and flies on unshaped, in the page's space
  vec3 origin = (uShape * uRest * vec4(position, 1.0)).xyz;
  vec3 direction = normalize(mat3(uRest) * aDirection);
  vec3 p = origin + direction * (1.0 - pow(1.0 - clamp(life, 0.0, 1.0), 3.0)) * uDistance * (0.4 + aRandom);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float visible = step(0.0, life) * step(life, 1.0);
  gl_PointSize = visible * uSize * length(modelViewMatrix[0].xyz) * projectionMatrix[1][1] * uViewportHalfHeight / -mvPosition.z
    * (0.5 + aRandom) * (1.0 - life);
}
`;

const SPARK_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float edge = clamp(1.0 - d * 2.0, 0.0, 1.0);
  if (edge <= 0.0) discard;
  gl_FragColor = vec4(uColor * (2.5 - 2.0 * vLife), edge * edge * (1.0 - vLife));
}
`;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Where `u` lies between `from` and `to`, 0 → 1 */
const span = (u: number, from: number, to: number) => (to > from ? clamp01((u - from) / (to - from)) : u >= to ? 1 : 0);
const smoothstep = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export const register = (api: PluginApi): void => {
  const { three } = api;
  type Mesh = InstanceType<typeof three.Mesh>;

  api.registerAppearance("revealCode", {
    description: "The engine's inflate-and-dissolve look, as code: flat and small on the page, the entity rises, grows and turns under a noise dissolve with a glowing edge and sparks.",
    params: {
      duration: { kind: "number", default: 3470, min: 50, max: 10000, step: 10, unit: "ms", label: "appear", description: "How long it takes to appear." },
      outDuration: { kind: "number", default: 600, min: 50, max: 10000, step: 10, unit: "ms", label: "disappear", description: "How long it takes to disappear: the same animation, rewound." },
      heightFrom: { kind: "number", default: 0, min: 0, max: 1, step: 0.01, label: "height from", description: "Height along the page normal at the start, as a share of the real one: 0 = flat on the page." },
      scaleFrom: { kind: "number", default: 0, min: 0, max: 2, step: 0.01, label: "scale from", description: "Size at the start, as a share of the real one." },
      spin: { kind: "number", default: -0.5, min: -2, max: 2, step: 0.05, unit: "turns", description: "Turns around the page normal on the way in." },
      shapeEnd: { kind: "number", default: 0.8, min: 0, max: 1, step: 0.01, label: "shape end", description: "Share of the time at which the entity has its real shape." },
      maskEnd: { kind: "number", default: 0.75, min: 0, max: 1, step: 0.01, label: "mask end", description: "Share of the time at which the front has passed everything." },
      waves: { kind: "number", default: 3, min: 0.5, max: 12, step: 0.1, description: "Noise waves across the object." },
      edgeStart: { kind: "number", default: 0.06, min: 0, max: 0.5, step: 0.005, label: "edge from", description: "Width of the glowing edge at the front when it starts (0 = none)." },
      edgeEnd: { kind: "number", default: 0.015, min: 0, max: 0.5, step: 0.005, label: "edge to", description: "Width of the edge when the front has passed." },
      edgeColor: { kind: "color", default: "#f3cc94", label: "edge colour", description: "The edge's colour." },
      edgeIntensity: { kind: "number", default: 0.6, min: 0, max: 4, step: 0.05, label: "edge intensity", description: "Multiplies the edge's colour; above 1 it is brighter than white." },
      glow: { kind: "number", default: 0.6, min: 0, max: 1, step: 0.01, description: "How strongly the band behind the edge shines in the glow colour (0 = none)." },
      glowWidth: { kind: "number", default: 0.2, min: 0, max: 1, step: 0.01, label: "glow width", description: "Width of the shining band behind the edge." },
      glowColor: { kind: "color", default: "#f3cc94", label: "glow colour", description: "The glow's colour." },
      sparks: { kind: "number", default: 300, min: 0, max: 2000, step: 10, description: "Sparks flying from the surface (0 = none)." },
      sparkColor: { kind: "color", default: "#f3cc94", label: "spark colour", description: "The sparks' colour." },
      sparkSize: { kind: "number", default: 0.05, min: 0.005, max: 0.3, step: 0.005, unit: "widths", label: "spark size", description: "A spark's size in target widths." },
      sparkDistance: { kind: "number", default: 0.3, min: 0, max: 2, step: 0.01, unit: "widths", label: "spark flight", description: "How far a spark flies, in target widths." },
    },
  }, ({ object, anchor, params, moment, materials }) => {
    const num = (name: string) => Number(params[name]);
    const hex = (name: string) => new three.Color(String(params[name]));

    object.updateWorldMatrix(true, true);
    anchor.updateWorldMatrix(true, false);
    const objectInverse = new three.Matrix4().copy(object.matrixWorld).invert();
    const anchorInverse = new three.Matrix4().copy(anchor.matrixWorld).invert();

    // The meshes of the node tree, and the box of their vertices in two spaces: the entity's own (the noise's scale)
    // and the page's (where the shape stands and turns)
    const meshes: Mesh[] = [];
    object.traverse(child => {
      if ((child as Mesh).isMesh) meshes.push(child as Mesh);
    });
    const boxIn = (inverse: InstanceType<typeof three.Matrix4>) => {
      const box = new three.Box3();
      const point = new three.Vector3();
      const toSpace = new three.Matrix4();
      for (const mesh of meshes) {
        const position = mesh.geometry.getAttribute("position");
        toSpace.multiplyMatrices(inverse, mesh.matrixWorld);
        const step = Math.max(1, Math.floor(position.count / 4000));
        for (let i = 0; i < position.count; i += step) box.expandByPoint(mesh.getVertexPosition(i, point).applyMatrix4(toSpace));
      }
      return box;
    };
    const entityBox = boxIn(objectInverse);
    const pageBox = boxIn(anchorInverse);
    const size = entityBox.isEmpty() ? 1 : Math.max(1e-3, entityBox.getSize(new three.Vector3()).length());
    const pivot = pageBox.isEmpty()
      ? new three.Vector3()
      : new three.Vector3((pageBox.min.x + pageBox.max.x) / 2, (pageBox.min.y + pageBox.max.y) / 2, pageBox.min.z);

    // The mask: the engine hands out copies of the materials (on the meshes until the animation ends); the noise needs
    // each vertex in the entity's space, so every copy gets its mesh's matrix
    const uniforms = {
      uFreq: { value: num("waves") / size },
      uProgress: { value: 1 },
      uEdge: { value: 0 },
      uEdgeColor: { value: hex("edgeColor").multiplyScalar(num("edgeIntensity")) },
      uGlowWidth: { value: Math.max(num("glowWidth") * 2, 1e-3) },
      uGlowColor: { value: hex("glowColor") },
      uGlow: { value: num("glow") },
    };
    materials();
    for (const mesh of meshes) {
      const toEntity = new three.Matrix4().multiplyMatrices(objectInverse, mesh.matrixWorld);
      for (const copy of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        copy.onBeforeCompile = shader => {
          Object.assign(shader.uniforms, uniforms, { uToEntity: { value: toEntity } });
          shader.vertexShader = shader.vertexShader.replace("void main() {",
            "uniform mat4 uToEntity;\nvarying vec3 vRevealPosition;\nvoid main() {\n  vRevealPosition = (uToEntity * vec4(position, 1.0)).xyz;");
          const declarations = [
            "uniform float uFreq;", "uniform float uProgress;", "uniform float uEdge;", "uniform vec3 uEdgeColor;",
            "uniform float uGlowWidth;", "uniform vec3 uGlowColor;", "uniform float uGlow;", "varying vec3 vRevealPosition;",
          ].join("\n");
          shader.fragmentShader = `${declarations}\n${NOISE_GLSL}\n${shader.fragmentShader}`.replace(/\}\s*$/, FRAGMENT_TAIL);
        };
        copy.customProgramCacheKey = () => "revealCode";
        copy.needsUpdate = true;
      }
    }

    // The shape: the entity's matrix is the shape × its placement; this look gives the matrix back (dispose)
    const shape = new three.Matrix4();
    const placement = new three.Matrix4();
    const turn = new three.Matrix4();
    const stretch = new three.Matrix4();
    const toPivot = new three.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
    const fromPivot = new three.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z);
    const autoUpdate = object.matrixAutoUpdate;
    object.matrixAutoUpdate = false;
    const shapeAt = (k: number) => {
      const scale = Math.max(0.001, num("scaleFrom") + (1 - num("scaleFrom")) * k);
      const height = Math.max(0.004, num("heightFrom") + (1 - num("heightFrom")) * k);
      stretch.makeScale(scale, scale, scale * height);
      turn.makeRotationZ(num("spin") * 2 * Math.PI * (1 - k));
      shape.copy(fromPivot).multiply(turn).multiply(stretch).multiply(toPivot);
      placement.compose(object.position, object.quaternion, object.scale);
      object.matrix.multiplyMatrices(shape, placement);
      object.matrixWorldNeedsUpdate = true;
    };

    // The sparks: points at the vertices of the meshes, with their normals (a little scattered) as their flight
    const count = Math.round(num("sparks"));
    let sparks: InstanceType<typeof three.Points> | null = null;
    const sparkProgress = { value: 0 };
    if (count > 0 && meshes.length) {
      const positions = new Float32Array(count * 3);
      const directions = new Float32Array(count * 3);
      const randoms = new Float32Array(count);
      let seed = 1;
      const random = () => {
        const x = Math.sin(seed++ * 12.9898) * 43758.5453;
        return x - Math.floor(x);
      };
      const point = new three.Vector3();
      const normal = new three.Vector3();
      for (let i = 0; i < count; i++) {
        const mesh = meshes[i % meshes.length];
        const attribute = mesh.geometry.getAttribute("position");
        const vertex = Math.floor(random() * attribute.count);
        const toEntity = new three.Matrix4().multiplyMatrices(objectInverse, mesh.matrixWorld);
        mesh.getVertexPosition(vertex, point).applyMatrix4(toEntity);
        const normals = mesh.geometry.getAttribute("normal");
        if (normals) normal.fromBufferAttribute(normals, vertex).transformDirection(toEntity);
        else normal.set(0, 0, 1);
        normal.add(new three.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.8)).normalize();
        point.toArray(positions, i * 3);
        normal.toArray(directions, i * 3);
        randoms[i] = random();
      }
      const geometry = new three.BufferGeometry();
      geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
      geometry.setAttribute("aDirection", new three.BufferAttribute(directions, 3));
      geometry.setAttribute("aRandom", new three.BufferAttribute(randoms, 1));
      const material = new three.ShaderMaterial({
        uniforms: {
          uFreq: uniforms.uFreq,
          uSparkProgress: sparkProgress,
          uSize: { value: num("sparkSize") },
          uDistance: { value: num("sparkDistance") },
          uColor: { value: hex("sparkColor") },
          uViewportHalfHeight: { value: (window.innerHeight * Math.min(window.devicePixelRatio, 2)) / 2 },
          uRest: { value: new three.Matrix4().multiplyMatrices(anchorInverse, object.matrixWorld) },
          uShape: { value: shape },
        },
        vertexShader: SPARK_VERTEX,
        fragmentShader: SPARK_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: three.AdditiveBlending,
      });
      sparks = new three.Points(geometry, material);
      sparks.frustumCulled = false;
      anchor.add(sparks);
    }

    // The front runs from before the pattern's start to past its end, edge and glow included
    const reach = 1.001 + Math.max(num("edgeStart"), num("edgeEnd")) + (num("glow") > 0 ? num("glowWidth") : 0);
    return {
      duration: moment === "lost" ? num("outDuration") : num("duration"),
      update: visible => {
        const m = smoothstep(span(visible, 0, num("maskEnd")));
        const front = -0.001 + (reach + 0.001) * m;
        uniforms.uProgress.value = 1 - 2 * front;
        uniforms.uEdge.value = 2 * (num("edgeStart") + (num("edgeEnd") - num("edgeStart")) * m);
        shapeAt(1 - (1 - span(visible, 0, num("shapeEnd"))) ** 3);
        sparkProgress.value = front + 0.45 * span(visible, num("maskEnd"), 1);
        if (sparks) sparks.visible = visible > 0 && visible < 1;
      },
      dispose: () => {
        object.matrixAutoUpdate = autoUpdate;
        object.updateMatrix();
        object.matrixWorldNeedsUpdate = true;
        if (sparks) {
          sparks.removeFromParent();
          sparks.geometry.dispose();
          (sparks.material as InstanceType<typeof three.ShaderMaterial>).dispose();
        }
      },
    };
  });
};
