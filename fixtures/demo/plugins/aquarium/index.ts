import type { PluginApi } from "osct-plugin-api";

/**
 * An aquarium on the page (#188): the three things a plugin can add since plugin API 1.4, together –
 *
 * - `registerTexture("caustics")`: a procedural texture – a tileable pattern of light, drawn once into a DataTexture;
 *   the floor samples it twice, drifting against each other, so the light dances without redrawing anything.
 * - `registerMaterial("water")`: a whole material – a ShaderMaterial whose vertex shader moves the top of a mesh in
 *   waves and whose fragment shader tints by depth and angle (refraction-like: what lies behind looks deeper and bluer).
 *   Any mesh node can carry it (`material: { type: water }`); here the aquarium's water does.
 * - `registerNodeType("aquarium")`: a glass tank with a sandy floor, a water volume and a few fish. Built like a glTF
 *   model – y up, its floor at y = 0 – so it stands on the page with `rotation: [90, 0, 0]`. When the node carries a
 *   material, only the water takes it: the glass, the floor and the fish say `userData.keepMaterial`.
 *
 * A shader study (#202): a toy fish (or a ball) dips into the water on a loop and a tap pushes it in once. The tank
 * simulates its surface as a heightfield – a damped wave equation on a small grid, on the CPU, written into a half-float
 * DataTexture after each step. Where the body cuts the surface it pushes the heightfield down by the volume it displaces
 * and gives it back as it rises, so rings run outward, bounce off the glass and settle. The water material reads the
 * heightfield when the tank hands it over (its uniforms `heightfield`, `hasHeightfield`, …): the surface's vertices
 * follow it and its slopes drive the tint, a fresnel highlight and a glint; the floor's caustics brighten where the
 * surface focuses the light. Without the simulation (or on another mesh) the water keeps its static waves.
 *
 * Light on a phone: a few hundred triangles of tank and fish, the water's top as fine as the grid, the caustics drawn
 * once (128² pixels), the simulation a few thousand cells per step, no render target, nothing allocated per frame.
 */

/** How strongly a cell is pulled towards its neighbours' mean per step (the wave equation is stable below 2) */
const PULL = 1.2;

/**
 * The water's surface as a heightfield (#202): `cols` × `rows` cells, each with a height (above the rest level, in the
 * tank's units) and a vertical velocity. `step` advances the damped wave equation once: every cell accelerates towards
 * the mean of its four neighbours and keeps `keep` of its velocity; the glass reflects (a missing neighbour is the cell
 * itself), so the sum of the heights – the water's volume – never changes. `displace` takes the body's submerged column
 * per cell: what it gained since the last call is pushed out of its cells and spread evenly over the surface, what it
 * lost flows back – the volume stays the same and the body's movement starts the waves.
 */
const createWaves = (cols: number, rows: number) => {
  const count = cols * rows;
  const height = new Float32Array(count);
  const velocity = new Float32Array(count);
  const occupied = new Float32Array(count);
  return {
    cols,
    rows,
    height,
    velocity,
    /** One step of the wave equation; `keep` is the share of each cell's velocity that survives the step (damping) */
    step(keep: number): void {
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          const h = height[k];
          const left = i > 0 ? height[k - 1] : h;
          const right = i < cols - 1 ? height[k + 1] : h;
          const down = j > 0 ? height[k - cols] : h;
          const up = j < rows - 1 ? height[k + cols] : h;
          velocity[k] = (velocity[k] + ((left + right + down + up) * 0.25 - h) * PULL) * keep;
        }
      }
      for (let k = 0; k < count; k++) height[k] += velocity[k];
    },
    /**
     * The body's submerged column per cell now (tank units): the change since the last call displaces the water,
     * `gain` times its own volume (1 = true to size)
     */
    displace(columns: Float32Array, gain = 1): void {
      let moved = 0;
      for (let k = 0; k < count; k++) {
        const change = (columns[k] - occupied[k]) * gain;
        if (change !== 0) {
          height[k] -= change;
          moved += change;
          occupied[k] = columns[k];
        }
      }
      if (moved === 0) return;
      const share = moved / count;
      for (let k = 0; k < count; k++) height[k] += share;
    },
    /** The sum of the heights (the volume above the rest level, in cell columns): stays where it started */
    volume(): number {
      let sum = 0;
      for (let k = 0; k < count; k++) sum += height[k];
      return sum;
    },
  };
};

/** Where the body is: its centre in the tank's units, its turn about y (radians) and its half-axes */
interface BodyShape {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Half-length (along its nose), half-height, half-width */
  a: number;
  b: number;
  c: number;
}

/**
 * The submerged column per cell of an ellipsoid body (#202): for every cell under it, how much of the body's vertical
 * extent lies below the rest level `rest`. The grid spans `sizeX` × `sizeZ` around the tank's middle.
 */
const submerged = (out: Float32Array, cols: number, rows: number, sizeX: number, sizeZ: number, body: BodyShape, rest: number): void => {
  out.fill(0);
  if (body.y - body.b >= rest) return;
  const cellX = sizeX / cols;
  const cellZ = sizeZ / rows;
  const reach = Math.max(body.a, body.c);
  const cos = Math.cos(body.yaw);
  const sin = Math.sin(body.yaw);
  const i0 = Math.max(0, Math.floor((body.x - reach + sizeX / 2) / cellX));
  const i1 = Math.min(cols - 1, Math.ceil((body.x + reach + sizeX / 2) / cellX));
  const j0 = Math.max(0, Math.floor((body.z - reach + sizeZ / 2) / cellZ));
  const j1 = Math.min(rows - 1, Math.ceil((body.z + reach + sizeZ / 2) / cellZ));
  for (let j = j0; j <= j1; j++) {
    const dz = -sizeZ / 2 + (j + 0.5) * cellZ - body.z;
    for (let i = i0; i <= i1; i++) {
      const dx = -sizeX / 2 + (i + 0.5) * cellX - body.x;
      // Into the body's frame (a turn by yaw about y): its nose is +x
      const u = (dx * cos - dz * sin) / body.a;
      const w = (dx * sin + dz * cos) / body.c;
      const q = 1 - u * u - w * w;
      if (q <= 0) continue;
      const half = body.b * Math.sqrt(q);
      const below = rest - (body.y - half);
      out[j * cols + i] = below <= 0 ? 0 : Math.min(below, half * 2);
    }
  }
};

export const register = (api: PluginApi): void => {
  const { three } = api;

  // ── the caustics: a pattern of light, tileable, drawn once; it drifts by its offset ──
  api.registerTexture("caustics", {
    description: "Light dancing on a floor under water: a tileable pattern of bright lines that drifts.",
    params: {
      size: { kind: "number", default: 128, min: 32, max: 256, step: 32, unit: "px", description: "Pixels per side: sharper, but slower to draw once." },
      cells: { kind: "number", default: 3, min: 1, max: 8, step: 1, description: "How many cells of light across one tile." },
      sharpness: { kind: "number", default: 5, min: 1, max: 12, step: 0.5, description: "How thin the lines of light are." },
      speed: { kind: "number", default: 0.04, min: 0, max: 0.5, step: 0.01, description: "How fast the pattern drifts (tiles per second)." },
    },
  }, ({ params }) => {
    const size = Math.round(Number(params.size));
    const cells = Math.round(Number(params.cells));
    const sharpness = Number(params.sharpness);
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Whole multiples of 2π across the tile: the pattern repeats without a seam
        const u = (x / size) * Math.PI * 2 * cells;
        const v = (y / size) * Math.PI * 2 * cells;
        const s = Math.sin(u + 1.6 * Math.sin(v)) + Math.sin(v + 1.6 * Math.sin(u + 1.3)) + Math.sin(u + v + 1.2 * Math.sin(u - v));
        const light = Math.pow(1 - Math.min(1, Math.abs(s) / 3), sharpness);
        const value = Math.round(255 * light);
        data.set([value, value, value, 255], (y * size + x) * 4);
      }
    }
    const texture = new three.DataTexture(data, size, size);
    texture.wrapS = texture.wrapT = three.RepeatWrapping;
    texture.magFilter = three.LinearFilter;
    texture.needsUpdate = true;
    const speed = Number(params.speed);
    return {
      texture,
      update: delta => texture.offset.set(texture.offset.x + delta * speed, texture.offset.y + delta * speed * 0.6),
    };
  });

  // ── the water: waves on the top of a mesh, a tint by depth and angle; a heightfield when a tank hands one over ──
  api.registerMaterial("water", {
    description: "Water: waves on the top faces, a tint that deepens with the angle and the depth, a shimmer.",
    params: {
      shallow: { kind: "color", default: "#7fd6e8", label: "shallow", description: "The water's colour where you look straight through little of it." },
      deep: { kind: "color", default: "#0b4f6c", label: "deep", description: "Its colour at a grazing angle and near the floor." },
      opacity: { kind: "number", default: 0.45, min: 0.05, max: 1, step: 0.01, description: "How much of what lies behind shows through." },
      waveHeight: { kind: "number", default: 0.012, min: 0, max: 0.05, step: 0.001, label: "wave height", description: "How high the waves on the top rise (target widths) – the static waves, without a simulated surface." },
      waveSpeed: { kind: "number", default: 1, min: 0, max: 4, step: 0.1, unit: "×", label: "wave speed", description: "How fast the static waves run." },
      ripples: { kind: "texture", default: "", label: "ripples", description: "A picture that shimmers over the water (a Library image, or caustics) – none: the shader's own shimmer." },
    },
  }, ({ params, time }) => {
    const ripples = (params.ripples ?? null) as InstanceType<typeof three.Texture> | null;
    const uniforms = {
      time,
      shallow: { value: new three.Color(String(params.shallow)) },
      deep: { value: new three.Color(String(params.deep)) },
      opacity: { value: Number(params.opacity) },
      waveHeight: { value: Number(params.waveHeight) },
      waveSpeed: { value: Number(params.waveSpeed) },
      ripples: { value: ripples },
      hasRipples: { value: ripples ? 1 : 0 },
      // The simulated surface (#202), set by the aquarium every frame: heights above the rest level over the mesh's
      // x/z extent `fieldSize`, one texel per cell; `surfaceTop` is the mesh's top (local y) – its edge follows too
      heightfield: { value: null as InstanceType<typeof three.Texture> | null },
      hasHeightfield: { value: 0 },
      fieldSize: { value: new three.Vector2(1, 1) },
      fieldTexel: { value: new three.Vector2(1 / 64, 1 / 64) },
      surfaceTop: { value: 1e9 },
    };
    const material = new three.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: three.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float time;
        uniform float waveHeight;
        uniform float waveSpeed;
        uniform sampler2D heightfield;
        uniform float hasHeightfield;
        uniform vec2 fieldSize;
        uniform vec2 fieldTexel;
        uniform float surfaceTop;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vToCamera;
        varying vec3 vLightView;
        varying vec3 vUpView;
        varying float vDepth;
        varying float vTop;
        void main() {
          vUv = uv;
          vec3 p = position;
          vec3 n = normal;
          // Only faces that look up move: the water's surface
          float top = step(0.5, normal.y);
          if (hasHeightfield > 0.5) {
            // The simulated surface: the top and the upper edge of the sides follow the heightfield
            vec2 cell = vec2(p.x, p.z) / fieldSize + 0.5;
            float rim = step(surfaceTop - 1e-4, p.y);
            p.y += max(top, rim) * texture2D(heightfield, cell).r;
            if (top > 0.5) {
              float left = texture2D(heightfield, cell - vec2(fieldTexel.x, 0.0)).r;
              float right = texture2D(heightfield, cell + vec2(fieldTexel.x, 0.0)).r;
              float back = texture2D(heightfield, cell - vec2(0.0, fieldTexel.y)).r;
              float front = texture2D(heightfield, cell + vec2(0.0, fieldTexel.y)).r;
              vec2 span = 2.0 * fieldSize * fieldTexel;
              vec2 slope = vec2(right - left, front - back) / span;
              n = normalize(vec3(-slope.x, 1.0, -slope.y));
            }
          } else {
            float t = time * waveSpeed;
            float wave = sin(p.x * 31.0 + t * 2.1) * 0.5 + sin(p.z * 41.0 - t * 1.7) * 0.3 + sin((p.x - p.z) * 19.0 + t * 1.3) * 0.2;
            p.y += top * wave * waveHeight;
          }
          vTop = top;
          vDepth = 1.0 - clamp(uv.y, 0.0, 1.0);
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          vToCamera = -view.xyz;
          vNormalView = normalize(normalMatrix * n);
          // A light from above the tank, a little to the front: it moves with the tank, not with the camera
          vLightView = normalize(normalMatrix * vec3(0.35, 1.0, 0.45));
          vUpView = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
          gl_Position = projectionMatrix * view;
        }`,
      // vUv and the colour space last: a node's material layers add on top of this shader
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform vec3 shallow;
        uniform vec3 deep;
        uniform float opacity;
        uniform sampler2D ripples;
        uniform float hasRipples;
        uniform float hasHeightfield;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vToCamera;
        varying vec3 vLightView;
        varying vec3 vUpView;
        varying float vDepth;
        varying float vTop;
        void main() {
          vec3 n = normalize(vNormalView);
          vec3 toCamera = normalize(vToCamera);
          // Refraction-like: a grazing look goes through more water – deeper, bluer, less clear
          float facing = abs(dot(n, toCamera));
          float through = clamp((1.0 - facing) * 0.8 + vDepth * 0.35, 0.0, 1.0);
          float alphaBoost = 0.0;
          vec3 glow = vec3(0.0);
          if (hasHeightfield > 0.5 && vTop > 0.5) {
            vec3 side = gl_FrontFacing ? n : -n;
            vec3 up = normalize(gl_FrontFacing ? vUpView : -vUpView);
            vec3 light = normalize(vLightView);
            // Relief: a patch tilted towards the light is brighter, one tilted away darker – the rings show as light and
            // shade, measured against the flat surface
            float relief = clamp(dot(side, light) - dot(up, light), -0.12, 0.2);
            // Refraction-like: the view bent by a tilted patch runs a longer or shorter way through the water than through
            // the flat surface – deeper or clearer
            float bend = length(refract(-toCamera, side, 0.75) + toCamera) - length(refract(-toCamera, up, 0.75) + toCamera);
            through = clamp(through + bend * 0.8 - relief * 0.3, 0.0, 0.85);
            glow += mix(shallow, vec3(1.0), 0.5) * relief * 2.0;
            // Fresnel: a grazing look reflects the bright room; a glint where the surface mirrors the light
            float fresnel = pow(1.0 - clamp(dot(side, toCamera), 0.0, 1.0), 4.0);
            float glint = gl_FrontFacing ? pow(max(dot(side, normalize(light + toCamera)), 0.0), 40.0) : 0.0;
            glow += vec3(0.85, 0.95, 1.0) * (fresnel * 0.35 + glint * 0.9);
            alphaBoost = fresnel * 0.3 + glint * 0.6 + abs(relief) * 0.5;
          }
          vec3 colour = mix(shallow, deep, through) + glow;
          float shimmer = hasRipples > 0.5
            ? texture2D(ripples, vUv * 2.0 + vec2(time * 0.03, time * 0.02)).r
            : 0.5 + 0.5 * sin(vUv.x * 47.0 + time * 1.3) * sin(vUv.y * 39.0 - time * 1.1);
          colour += shimmer * 0.08;
          gl_FragColor = vec4(colour, clamp(mix(opacity, 1.0, through * 0.5) + alphaBoost, 0.0, 1.0));
          #include <colorspace_fragment>
        }`,
    });
    return {
      material,
      // Colours, clarity and waves change in place; another ripples picture builds it anew
      tune: next => {
        uniforms.shallow.value.set(String(next.shallow));
        uniforms.deep.value.set(String(next.deep));
        uniforms.opacity.value = Number(next.opacity);
        uniforms.waveHeight.value = Number(next.waveHeight);
        uniforms.waveSpeed.value = Number(next.waveSpeed);
        return true;
      },
    };
  });

  // ── the aquarium: glass, a floor with caustics, water, fish – and a toy that dips into the water ──
  const FISH_COLOURS = ["#ff8a3d", "#ffd23f", "#f25f5c", "#7bdff2", "#b9fbc0"];

  /** Steps of the simulation per second at the grid of 64 – a finer grid steps more often, so the rings run as fast */
  const STEPS_PER_SECOND = 60;
  /** At most this many steps in one frame: a long frame (a hidden tab) drops the rest instead of catching up */
  const MAX_STEPS = 4;
  /** How long a tap's push takes, down and back (seconds) */
  const PUSH_SECONDS = 0.9;

  api.registerNodeType("aquarium", {
    description: "A glass tank with a sandy floor, water and fish, and a toy fish (or a ball) that dips into the water and makes rings – y up, its floor at the node's origin (stand it on the page with rotation [90, 0, 0]).",
    src: "none",
    params: {
      width: { kind: "number", default: 0.7, min: 0.1, max: 2, step: 0.01, description: "The tank's width (x), in target widths." },
      depth: { kind: "number", default: 0.4, min: 0.1, max: 2, step: 0.01, description: "The tank's depth (z), in target widths." },
      height: { kind: "number", default: 0.45, min: 0.1, max: 2, step: 0.01, description: "The tank's height (y), in target widths." },
      level: { kind: "number", default: 0.85, min: 0.2, max: 1, step: 0.01, label: "water level", description: "How full the tank is (a share of its height)." },
      fish: { kind: "number", default: 5, min: 0, max: 12, step: 1, label: "fish", description: "How many fish swim." },
      fishSpeed: { kind: "number", default: 1, min: 0, max: 4, step: 0.1, unit: "×", label: "fish speed", description: "How fast they swim." },
      sand: { kind: "color", default: "#d9c48f", description: "The floor's colour." },
      floor: { kind: "texture", default: "caustics", label: "floor light", description: "The light on the floor: the caustics, another procedural texture or a picture – none: plain sand." },
      body: { kind: "choice", options: ["fish", "ball", "none"], default: "fish", label: "dipping toy", description: "What dips into the water: a plastic toy fish, a ball, or nothing." },
      period: { kind: "number", default: 4, min: 0, max: 12, step: 0.5, unit: "s", label: "loop period", description: "Seconds for one dip and rise – 0: the toy waits above the water for a tap." },
      dip: { kind: "number", default: 0.02, min: 0, max: 0.12, step: 0.005, label: "dip depth", description: "How deep the toy's middle goes under the surface at the bottom of a dip (target widths); a tap pushes it deeper." },
      simulate: { kind: "boolean", default: true, label: "simulation", description: "The surface as a simulated heightfield: rings where the toy dips. Off: the water's static waves." },
      grid: { kind: "choice", options: ["32", "64", "96"], default: "64", label: "grid", description: "Cells of the simulation along the tank's longer side: finer rings, more work per frame." },
      damping: { kind: "number", default: 1.2, min: 0, max: 6, step: 0.1, unit: "/s", label: "damping", description: "How fast the rings settle: the share of their motion lost per second." },
      splash: { kind: "number", default: 4, min: 1, max: 12, step: 0.5, unit: "×", label: "splash", description: "How much water the toy pushes aside: 1 = its own volume (true to size, faint at this scale), more makes the rings taller." },
    },
  }, ({ params }) => {
    const width = Number(params.width);
    const depth = Number(params.depth);
    const height = Number(params.height);
    const level = height * Number(params.level);
    const glassInset = 0.004;
    const tank = new three.Group();
    tank.name = "aquarium";
    const keep = <T extends InstanceType<typeof three.Object3D>>(object: T): T => {
      object.userData.keepMaterial = true;
      return object;
    };
    const disposables: Array<{ dispose(): void }> = [];
    const own = <T extends { dispose(): void }>(thing: T): T => {
      disposables.push(thing);
      return thing;
    };

    // The surface's simulation: square cells, `grid` of them along the longer side
    const innerX = width - glassInset * 2;
    const innerZ = depth - glassInset * 2;
    const waterHeight = level - 0.004;
    const simulate = params.simulate !== false;
    const grid = Number(params.grid) || 64;
    const cols = innerX >= innerZ ? grid : Math.max(4, Math.round((grid * innerX) / innerZ));
    const rows = innerX >= innerZ ? Math.max(4, Math.round((grid * innerZ) / innerX)) : grid;
    const waves = createWaves(cols, rows);
    const columns = new Float32Array(cols * rows);
    const fieldData = new Uint16Array(cols * rows);
    const field = own(new three.DataTexture(fieldData, cols, rows, three.RedFormat, three.HalfFloatType));
    field.magFilter = field.minFilter = three.LinearFilter;
    field.wrapS = field.wrapT = three.ClampToEdgeWrapping;
    field.needsUpdate = true;
    const stepSeconds = 1 / (STEPS_PER_SECOND * (grid / 64));
    let keepPerStep = Math.exp(-Number(params.damping) * stepSeconds);

    // The floor: sand lit by the caustics, sampled twice and drifting against each other; with the simulation the
    // light shifts with the surface's slope and gathers where the surface bulges (a lens) – it spreads under a trough
    const floorTexture = (params.floor ?? null) as InstanceType<typeof three.Texture> | null;
    const floorUniforms = {
      sand: { value: new three.Color(String(params.sand)) },
      light: { value: floorTexture },
      hasLight: { value: floorTexture ? 1 : 0 },
      scale: { value: new three.Vector2(width * 3, depth * 3) },
      field: { value: field },
      hasField: { value: simulate ? 1 : 0 },
      fieldTexel: { value: new three.Vector2(1 / cols, 1 / rows) },
      // The curvature of a ring is smaller on a finer grid (per cell): the gain keeps the light the same
      focus: { value: 35 * (grid / 64) * (grid / 64) },
    };
    const floorMaterial = own(new three.ShaderMaterial({
      uniforms: floorUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sand;
        uniform sampler2D light;
        uniform float hasLight;
        uniform vec2 scale;
        uniform sampler2D field;
        uniform float hasField;
        uniform vec2 fieldTexel;
        uniform float focus;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv * scale;
          float gather = 1.0;
          if (hasField > 0.5) {
            // The plane's v runs against the tank's z: the field's row is 1 - v
            vec2 cell = vec2(vUv.x, 1.0 - vUv.y);
            float h = texture2D(field, cell).r;
            float left = texture2D(field, cell - vec2(fieldTexel.x, 0.0)).r;
            float right = texture2D(field, cell + vec2(fieldTexel.x, 0.0)).r;
            float back = texture2D(field, cell - vec2(0.0, fieldTexel.y)).r;
            float front = texture2D(field, cell + vec2(0.0, fieldTexel.y)).r;
            uv += vec2(right - left, back - front) * 6.0 * scale;
            gather = clamp(1.0 - (left + right + back + front - 4.0 * h) * focus, 0.45, 2.2);
          }
          float a = texture2D(light, uv).r;
          float b = texture2D(light, uv.yx * 0.8 + vec2(0.37, 0.11)).r;
          float caustic = hasLight > 0.5 ? (min(a, b) * 1.6 + (a + b) * 0.15) * gather + (gather - 1.0) * 0.12 : 0.0;
          gl_FragColor = vec4(sand * (0.75 + caustic), 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    const floor = keep(new three.Mesh(own(new three.PlaneGeometry(innerX, innerZ)), floorMaterial));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    tank.add(floor);

    // The water: a box whose top moves – it takes the node's material (water); without one a plain blue. With the
    // simulation its top has a vertex per cell
    const water = new three.Mesh(
      own(new three.BoxGeometry(innerX, waterHeight, innerZ, simulate ? cols : 32, 1, simulate ? rows : 18)),
      own(new three.MeshStandardMaterial({ color: "#5fb8d0", transparent: true, opacity: 0.35, depthWrite: false })),
    );
    water.position.y = 0.002 + waterHeight / 2;
    water.renderOrder = 2;
    tank.add(water);
    const rest = 0.002 + waterHeight;

    // The glass: a faint box and its edges, drawn after the water
    const glass = keep(new three.Mesh(
      own(new three.BoxGeometry(width, height, depth)),
      own(new three.MeshStandardMaterial({ color: "#e6f7ff", transparent: true, opacity: 0.12, roughness: 0.05, depthWrite: false, side: three.DoubleSide })),
    ));
    glass.position.y = height / 2;
    glass.renderOrder = 3;
    tank.add(glass);
    const edges = new three.LineSegments(own(new three.EdgesGeometry(glass.geometry)), own(new three.LineBasicMaterial({ color: "#f2fbff", transparent: true, opacity: 0.7 })));
    edges.position.copy(glass.position);
    edges.renderOrder = 3;
    tank.add(edges);

    // The toy: a glossy plastic fish of a few primitives (an ellipsoid body, a tail fin, a dorsal fin, eyes) or a ball,
    // hanging above the middle of the tank; it dips in and rises, nose down on the way in
    const kind = String(params.body);
    const toy = new three.Group();
    toy.name = "toy";
    const plastic = (colour: string) => own(new three.MeshPhysicalMaterial({ color: colour, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }));
    const unit = Math.min(width, depth);
    const shape: BodyShape = { x: innerX * 0.08, y: 0, z: 0, yaw: 0.45, a: 0, b: 0, c: 0 };
    let toyTail: InstanceType<typeof three.Mesh> | null = null;
    if (kind === "fish") {
      shape.a = unit * 0.2;
      shape.b = unit * 0.11;
      shape.c = unit * 0.075;
      const skin = plastic("#ff9a2a");
      const fin = plastic("#ffd84a");
      const body = keep(new three.Mesh(own(new three.SphereGeometry(1, 28, 18)), skin));
      body.scale.set(shape.a, shape.b, shape.c);
      const tail = keep(new three.Mesh(own(new three.ConeGeometry(1, 1, 18)), fin));
      tail.scale.set(shape.b * 0.95, shape.a * 0.7, shape.c * 0.2);
      tail.rotation.z = -Math.PI / 2;
      tail.position.x = -shape.a * 0.8 - shape.a * 0.32;
      const dorsal = keep(new three.Mesh(own(new three.ConeGeometry(1, 1, 14)), fin));
      dorsal.scale.set(shape.a * 0.32, shape.b * 0.7, shape.c * 0.16);
      dorsal.rotation.z = 0.55;
      dorsal.position.set(-shape.a * 0.15, shape.b * 0.95, 0);
      const white = plastic("#ffffff");
      const black = plastic("#141414");
      const eyeBall = own(new three.SphereGeometry(1, 14, 10));
      for (const side of [1, -1]) {
        const eye = keep(new three.Mesh(eyeBall, white));
        eye.scale.setScalar(shape.b * 0.24);
        eye.position.set(shape.a * 0.58, shape.b * 0.28, side * shape.c * 0.62);
        const pupil = keep(new three.Mesh(eyeBall, black));
        pupil.scale.setScalar(shape.b * 0.12);
        pupil.position.set(shape.a * 0.66, shape.b * 0.3, side * shape.c * 0.8);
        toy.add(eye, pupil);
      }
      toy.add(body, tail, dorsal);
      toyTail = tail;
    } else if (kind === "ball") {
      shape.a = shape.b = shape.c = unit * 0.13;
      const ball = keep(new three.Mesh(own(new three.SphereGeometry(shape.a, 32, 20)), plastic("#e63946")));
      const band = keep(new three.Mesh(own(new three.TorusGeometry(shape.a * 1.002, shape.a * 0.09, 10, 48)), plastic("#ffffff")));
      band.rotation.y = Math.PI / 2;
      toy.add(ball, band);
    }
    const hasToy = shape.b > 0;
    if (hasToy) tank.add(toy);

    // The loop: a quick plunge (a fifth of the period, from fully out of the water to its middle `dip` under the surface)
    // – a rest down there – a slow rise – a wait above; a quick entry makes short, crisp rings. A tap pushes it deeper
    // once. Positions are a function of time, so the simulation's steps can sample them between frames
    let period = Number(params.period);
    let dip = Number(params.dip);
    let splash = Number(params.splash);
    // Fully out of the water at the top of the loop, with a little air under it
    const clearance = 0.03;
    let pushedAt = -1e9;
    const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
    /** How far down the toy is (0 above, 1 at the bottom) at a share of the period */
    const loopDepth = (p: number): number => (p < 0.2 ? ease(p / 0.2) : p < 0.45 ? 1 : p < 0.8 ? 1 - ease((p - 0.45) / 0.35) : 0);
    const toyY = (t: number): number => {
      const high = rest + shape.b + clearance;
      const low = rest - dip;
      const s = period > 0 ? loopDepth((t % period) / period) : 0;
      let y = high + (low - high) * s;
      const age = t - pushedAt;
      if (age >= 0 && age < PUSH_SECONDS) {
        const pushed = Math.max(shape.b + 0.01, rest - dip - shape.b * 0.9);
        y += (pushed - y) * Math.sin((age / PUSH_SECONDS) * Math.PI);
      }
      return y;
    };

    // The fish: an ellipsoid body and a flat tail, each on its own oval path at its own height – below the toy's reach
    const body = own(new three.SphereGeometry(1, 10, 6));
    const tail = own(new three.ConeGeometry(0.6, 1, 3));
    const colours = FISH_COLOURS.map(colour => own(new three.MeshStandardMaterial({ color: colour, roughness: 0.5 })));
    const size = Math.min(width, depth) * 0.11;
    const swimTop = hasToy ? Math.max(0.05, rest - Number(params.dip) - shape.b * 2 - size) : level - 0.05;
    const fish = Array.from({ length: Math.round(Number(params.fish)) }, (_, i) => {
      const one = new three.Group();
      const bodyMesh = keep(new three.Mesh(body, colours[i % colours.length]));
      bodyMesh.scale.set(size, size * 0.55, size * 0.35);
      const tailMesh = keep(new three.Mesh(tail, colours[i % colours.length]));
      tailMesh.scale.set(size * 0.55, size * 0.7, size * 0.12);
      tailMesh.rotation.z = -Math.PI / 2;
      tailMesh.position.x = -size * 1.15;
      one.add(bodyMesh, tailMesh);
      tank.add(one);
      return {
        one,
        tail: tailMesh,
        rx: (width / 2 - size * 2) * (0.45 + 0.5 * ((i * 37) % 10) / 10),
        rz: (depth / 2 - size * 2) * (0.4 + 0.5 * ((i * 53) % 10) / 10),
        y: 0.03 + Math.max(0, swimTop - 0.03) * (((i * 29) % 10) / 10),
        speed: (0.5 + ((i * 17) % 10) / 20) * (i % 2 ? 1 : -1),
        phase: i * 1.7,
      };
    });

    let fishSpeed = Number(params.fishSpeed);
    let clock = 0;
    let fishClock = 0;
    let simClock = 0;
    const swim = (delta: number) => {
      fishClock += delta * fishSpeed;
      for (const f of fish) {
        const a = f.phase + fishClock * f.speed;
        f.one.position.set(Math.cos(a) * f.rx, f.y + Math.sin(a * 3) * 0.008, Math.sin(a) * f.rz);
        // Heading along the path: the body's nose is +x, a turn by θ about y points it to (cos θ, 0, −sin θ)
        const dx = -Math.sin(a) * f.rx * Math.sign(f.speed);
        const dz = Math.cos(a) * f.rz * Math.sign(f.speed);
        f.one.rotation.y = Math.atan2(-dz, dx);
        f.tail.rotation.y = Math.sin(fishClock * 9 + f.phase) * 0.5;
      }
    };

    /** The toy where it is at the time `clock`, nose down while it goes in */
    const place = () => {
      if (!hasToy) return;
      const y = toyY(clock);
      const fall = (toyY(clock + 0.02) - y) / 0.02;
      toy.position.set(shape.x, y, shape.z);
      toy.rotation.set(0, shape.yaw, kind === "fish" ? Math.max(-0.6, Math.min(0.6, fall * 3)) : 0);
      if (toyTail) toyTail.rotation.x = Math.sin(clock * 7) * 0.25;
    };

    /** The heights into the texture (half floats, the water and the floor sample it) */
    const upload = () => {
      const heights = waves.height;
      for (let k = 0; k < heights.length; k++) fieldData[k] = three.DataUtils.toHalfFloat(heights[k]);
      field.needsUpdate = true;
    };

    /** The water's material reads the heightfield when it is the water shader (another material keeps its own look) */
    const handOver = () => {
      const u = (water.material as unknown as { uniforms?: Record<string, { value: unknown } | undefined> }).uniforms;
      if (!u?.heightfield || !u.hasHeightfield) return;
      u.heightfield.value = field;
      u.hasHeightfield.value = simulate ? 1 : 0;
      (u.fieldSize?.value as InstanceType<typeof three.Vector2> | undefined)?.set(innerX, innerZ);
      (u.fieldTexel?.value as InstanceType<typeof three.Vector2> | undefined)?.set(1 / cols, 1 / rows);
      if (u.surfaceTop) u.surfaceTop.value = waterHeight / 2;
    };

    let pending = 0;
    const update = (delta: number) => {
      const frame = Math.min(delta, 0.25);
      clock += frame;
      place();
      if (simulate) {
        pending += frame;
        let steps = 0;
        while (pending >= stepSeconds && steps < MAX_STEPS) {
          simClock += stepSeconds;
          if (hasToy) {
            shape.y = toyY(simClock);
            submerged(columns, cols, rows, innerX, innerZ, shape, rest);
            waves.displace(columns, splash);
          }
          waves.step(keepPerStep);
          pending -= stepSeconds;
          steps++;
        }
        if (steps === MAX_STEPS) {
          pending = 0;
          simClock = clock;
        }
        if (steps) upload();
      }
      handOver();
      swim(frame);
    };
    swim(0);
    place();
    // The simulation, for tests and for the curious in the console: `object.userData.waves`
    tank.userData.waves = waves;

    return {
      object: tank,
      update,
      // A tap pushes the toy into the water once
      onTap: () => {
        if (clock - pushedAt >= PUSH_SECONDS) pushedAt = clock;
      },
      // The fish's speed, the sand, the loop and the damping change in place; a new size, level, school, toy, grid or
      // simulation builds the tank anew
      tune: next => {
        if (["width", "depth", "height", "level", "fish", "grid"].some(key => Number(next[key]) !== Number(params[key]))) return false;
        if (String(next.body) !== kind || (next.simulate !== false) !== simulate) return false;
        fishSpeed = Number(next.fishSpeed);
        floorUniforms.sand.value.set(String(next.sand));
        period = Number(next.period);
        dip = Number(next.dip);
        splash = Number(next.splash);
        keepPerStep = Math.exp(-Number(next.damping) * stepSeconds);
        return true;
      },
      dispose: () => disposables.forEach(thing => thing.dispose()),
    };
  });
};
