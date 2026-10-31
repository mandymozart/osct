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
 * A toy fish (or a ball) dips into the water on a loop and a tap pushes it in once. The water is one of two:
 *
 * - **A WebGPU fluid inside the WebGL scene** (#228): Splash's MLS-MPM particles, simulated and rendered by a WebGPU
 *   device of the tank's own into an off-DOM canvas, from the scene's camera (handed over in the water's
 *   `onBeforeRender`). The canvas is a `CanvasTexture`; the water material samples it in screen space, so the fluid
 *   shows exactly inside the tank's faces and whatever stands in front of the tank hides it. The toy is the fluid's
 *   solid body: it pushes the particles aside.
 * - **The heightfield** (#202), the fallback without WebGPU or with *WebGPU* off: a damped wave equation on a small grid,
 *   on the CPU, written into a half-float DataTexture after each step. Where the body cuts the surface it pushes the
 *   heightfield down by the volume it displaces and gives it back as it rises, so rings run outward, bounce off the
 *   glass and settle. The water material reads it (its uniforms `heightfield`, `hasHeightfield`, …): the surface's
 *   vertices follow it and its slopes drive the tint, a fresnel highlight and a glint; the floor's caustics brighten
 *   where the surface focuses the light. Without the simulation (or on another mesh) the water keeps its static waves.
 *
 * Light on a phone: a few hundred triangles of tank and fish, the caustics drawn once (128² pixels), the heightfield a
 * few thousand cells per step with nothing allocated per frame; the fluid's GPU time follows its particle count and
 * render scale (parameters), it runs only in frames that draw the water, and the browser pauses it with a hidden page.
 */

/* ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * The WebGPU fluid below (the WGSL shaders and the simulation and render passes that drive them) is adapted from
 * Splash by Masaya Matsuoka (matsuoka-601), https://github.com/matsuoka-601/Splash – MLS-MPM simulation and
 * screen-space fluid rendering with the narrow-range filter (Truong and Yuksel, 2018). Adapted for the aquarium: the
 * tank's box as the domain, the scene's camera, the toy as a solid body instead of the mouse, a picture with alpha over
 * the scene instead of a cube map and a floor, no particle and shadow modes. Its licence:
 *
 * MIT License
 *
 * Copyright (c) 2025 matsuoka-601
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

type Three = PluginApi["three"];
type Matrix4 = InstanceType<Three["Matrix4"]>;

/**
 * WebGPU objects. The plugin API's DOM library has no WebGPU types, so they are loose here; the calls follow the WebGPU
 * specification.
 */
type Gpu = any;

/** WebGPU's usage flags (`GPUBufferUsage`, `GPUTextureUsage` – globals the plugin's types do not know) */
const BUFFER = { COPY_DST: 0x08, UNIFORM: 0x40, STORAGE: 0x80 };
const TEXTURE = { TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10 };

/**
 * Cells between the domain's edge and the tank's inside: room for the particles' 3×3×3 stencil. The inside is the
 * fluid's box – its walls are hard (the grid lets no water through them), so the water fills it to the glass and the floor
 */
const MARGIN = 3;
/** The inside's lowest corner in Splash's cells */
const INSIDE: [number, number, number] = [MARGIN, MARGIN, MARGIN];
/** How far the particles' centres keep from the walls (cells): their splats reach just past, the box cuts them flat */
const WALL_GAP = 0.3;
/** Particles per cell where the water rests: the pressure only pushes above it */
const REST_DENSITY = 3;
/** Particles per cell once settled (measured: the fluid compresses a little under its own weight) */
const SETTLED_DENSITY = 3.9;
/** A particle's diameter (cells) – its splat in the depth and thickness maps */
const DIAMETER = 2.2;
/** The narrow-range filter's reach per projected particle (Splash: 12; more makes the surface smoother) */
const FILTER = 20;
/** Simulation time per frame at 60 fps, and the most one step may take (larger steps are unstable) */
const SIM_DT = 0.32;
const SIM_DT_MAX = 0.4;
/** How strongly the fluid absorbs what passes through it (Splash: 0.7 – opaque at the tank's depth, so the fish would hide) */
const FLUID_DENSITY = 0.12;
/** The particle counts of the parameter */
const PARTICLES: Record<string, number> = { "10k": 10_000, "20k": 20_000, "40k": 40_000 };

/** Where the fluid runs: the WebGPU fluid, the heightfield, or the static waves */
type FluidPath = "webgpu" | "heightfield" | "still";
/** The tank's WebGPU: none in this browser, asked for, running, or failed (no adapter, a device error, the device lost) */
type GpuStatus = "missing" | "pending" | "ready" | "failed";

/**
 * Which water runs (#228): the WebGPU fluid when the node wants it, its WebGPU fluid is ready and the water carries the
 * `water` material (the one that composites it); else the heightfield, or the static waves with the simulation off
 */
const fluidPath = (state: { webgpu: boolean; gpu: GpuStatus; material: boolean; simulate: boolean }): FluidPath =>
  state.webgpu && state.gpu === "ready" && state.material ? "webgpu" : state.simulate ? "heightfield" : "still";

/**
 * The simulation domain (#228): the tank's inside in Splash's units (cells). The scale makes `particles` fill the water
 * up to its level once settled; the domain is the inside up to the glass top with `MARGIN` cells around it. `origin` is
 * the inside's lowest corner in the tank's units – Splash's `INSIDE`; `grid` is the cell count per axis (whole cells),
 * `size` the domain's extent (the inside ends `MARGIN` before it).
 */
interface SplashDomain {
  scale: number;
  size: [number, number, number];
  grid: [number, number, number];
  origin: [number, number, number];
  /** The water's height in cells */
  level: number;
  /** The particles placed (at most `particles`) */
  count: number;
}

const splashDomain = (inner: { x: number; y: number; z: number }, origin: [number, number, number], level: number, particles: number): SplashDomain => {
  const scale = Math.cbrt(particles / (SETTLED_DENSITY * inner.x * inner.z * level));
  const size: [number, number, number] = [inner.x * scale + 2 * MARGIN, inner.y * scale + 2 * MARGIN, inner.z * scale + 2 * MARGIN];
  const domain = { scale, size, grid: [Math.ceil(size[0]), Math.ceil(size[1]), Math.ceil(size[2])] as [number, number, number], origin, level: level * scale, count: 0 };
  const { across, room } = lattice(domain);
  domain.count = Math.min(particles, across * room);
  return domain;
};

/**
 * The lattice of the start at the settled density: a whole number of points across the inside (its spacing stretched
 * to fit), the layer spacing that keeps the density, the layers up to the glass top
 */
const lattice = (domain: Omit<SplashDomain, "count">) => {
  const spacing = Math.cbrt(1 / SETTLED_DENSITY);
  const span = (axis: number) => domain.size[axis] - 2 * MARGIN - 2 * WALL_GAP;
  const nx = Math.max(1, Math.round(span(0) / spacing));
  const nz = Math.max(1, Math.round(span(2) / spacing));
  const sx = span(0) / nx;
  const sz = span(2) / nz;
  const sy = 1 / (SETTLED_DENSITY * sx * sz);
  return { sx, sy, sz, nx, nz, across: nx * nz, room: Math.floor(span(1) / sy) };
};

/**
 * The particles to start with (Splash's 80-byte struct: position, velocity, affine matrix – 20 floats each): the water
 * as it rests – the inside filled from the floor at the settled density, layer by layer, each a little jittered (the
 * same every time)
 */
const splashParticles = (domain: SplashDomain): Float32Array => {
  const data = new Float32Array(domain.count * 20);
  const { sx, sy, sz, nx, nz } = lattice(domain);
  for (let n = 0; n < domain.count; n++) {
    const layer = Math.floor(n / (nx * nz));
    const i = n % nx;
    const k = Math.floor(n / nx) % nz;
    const jitter = ((n * 2654435761) % 1000) / 1000;
    data[n * 20] = INSIDE[0] + WALL_GAP + (i + 0.5) * sx + (jitter - 0.5) * 0.1;
    data[n * 20 + 1] = INSIDE[1] + WALL_GAP + (layer + 0.5) * sy;
    data[n * 20 + 2] = INSIDE[2] + WALL_GAP + (k + 0.5) * sz + (0.5 - jitter) * 0.1;
  }
  return data;
};

/** A point of the tank (its units) in Splash's cells, written into `out` at `at` */
const toCells = (domain: SplashDomain, x: number, y: number, z: number, out: Float32Array, at = 0): void => {
  out[at] = INSIDE[0] + (x - domain.origin[0]) * domain.scale;
  out[at + 1] = INSIDE[1] + (y - domain.origin[1]) * domain.scale;
  out[at + 2] = INSIDE[2] + (z - domain.origin[2]) * domain.scale;
};

/** Splash's camera matrices (render uniforms): the view of the domain in cells, its projection for WebGPU's depth */
interface SplashCamera {
  view: Matrix4;
  invView: Matrix4;
  projection: Matrix4;
  invProjection: Matrix4;
}

/**
 * The camera hand-off (#228): Splash's view and projection from the scene's camera and the tank.
 *
 * Splash → tank: `INSIDE` is the inside's corner, a cell is `1 / scale` tank units. The view is the camera's
 * inverse world matrix × the tank's world matrix × that, scaled back by `k` so its unit is Splash's cell again (the
 * filter's depth thresholds and the particles' size are in cells). The same picture needs the projection to take the
 * scaled depth: a perspective matrix's z row scales its constant term by `k` (near and far `k` times further) and keeps
 * x and y. WebGL's depth runs −1…1, WebGPU's 0…1: the z row becomes half itself plus half the w row.
 */
const splashCamera = (three: Three, cameraInverse: Matrix4, projection: Matrix4, tankWorld: Matrix4, domain: SplashDomain, out?: SplashCamera): SplashCamera => {
  const result = out ?? { view: new three.Matrix4(), invView: new three.Matrix4(), projection: new three.Matrix4(), invProjection: new three.Matrix4() };
  const step = 1 / domain.scale;
  const [ox, oy, oz] = domain.origin;
  result.view.makeScale(step, step, step).setPosition(ox - INSIDE[0] * step, oy - INSIDE[1] * step, oz - INSIDE[2] * step);
  result.view.premultiply(tankWorld).premultiply(cameraInverse);
  const k = 1 / result.view.getMaxScaleOnAxis();
  result.view.premultiply(result.invView.makeScale(k, k, k));
  result.invView.copy(result.view).invert();
  result.projection.copy(projection);
  const e = result.projection.elements;
  e[14] *= k;
  for (let column = 0; column < 4; column++) e[column * 4 + 2] = 0.5 * e[column * 4 + 2] + 0.5 * e[column * 4 + 3];
  result.invProjection.copy(result.projection).invert();
  return result;
};

// ── Splash's shaders (WGSL), adapted ──

/** The particle (80 bytes) and the simulation's uniforms: cells per axis, the count, the walls' extent, the step */
const WGSL_COMMON = /* wgsl */ `
struct Particle { position: vec3f, v: vec3f, C: mat3x3f, }
struct Sim { grid: vec3f, count: u32, size: vec3f, dt: f32, }
const FIXED: f32 = 1e7;
fn encodeFixed(x: f32) -> i32 { return i32(x * FIXED); }
fn decodeFixed(x: i32) -> f32 { return f32(x) / FIXED; }
fn cellIndex(cell: vec3f, sim: Sim) -> i32 {
  return i32(cell.x) * i32(sim.grid.y) * i32(sim.grid.z) + i32(cell.y) * i32(sim.grid.z) + i32(cell.z);
}
fn quadraticWeights(diff: vec3f) -> array<vec3f, 3> {
  return array<vec3f, 3>(0.5 * (0.5 - diff) * (0.5 - diff), 0.75 - diff * diff, 0.5 * (0.5 + diff) * (0.5 + diff));
}`;

/** The solid body (the toy): its centre, radii and velocity in cells, the turn from the domain into its own frame */
const WGSL_BODY = /* wgsl */ `
struct Body { center: vec3f, solid: f32, radii: vec3f, velocity: vec3f, toBody: mat3x3f, }`;

const WGSL_CLEAR = /* wgsl */ `
struct Cell { vx: i32, vy: i32, vz: i32, mass: i32, }
@group(0) @binding(0) var<storage, read_write> cells: array<Cell>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x < arrayLength(&cells)) { cells[id.x] = Cell(0, 0, 0, 0); }
}`;

/** Particles to grid, 1: mass and momentum (APIC) */
const WGSL_P2G_1 = /* wgsl */ `${WGSL_COMMON}
struct Cell { vx: atomic<i32>, vy: atomic<i32>, vz: atomic<i32>, mass: atomic<i32>, }
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> cells: array<Cell>;
@group(0) @binding(2) var<uniform> sim: Sim;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= sim.count) { return; }
  let particle = particles[id.x];
  let base = floor(particle.position);
  var weights = quadraticWeights(particle.position - (base + 0.5));
  for (var gx = 0; gx < 3; gx++) { for (var gy = 0; gy < 3; gy++) { for (var gz = 0; gz < 3; gz++) {
    let weight = weights[gx].x * weights[gy].y * weights[gz].z;
    let cell = base + vec3f(f32(gx), f32(gy), f32(gz)) - 1.0;
    let momentum = weight * (particle.v + particle.C * ((cell + 0.5) - particle.position));
    let i = cellIndex(cell, sim);
    atomicAdd(&cells[i].mass, encodeFixed(weight));
    atomicAdd(&cells[i].vx, encodeFixed(momentum.x));
    atomicAdd(&cells[i].vy, encodeFixed(momentum.y));
    atomicAdd(&cells[i].vz, encodeFixed(momentum.z));
  } } }
}`;

/** Particles to grid, 2: the pressure (Tait, γ = 1, only above the rest density) and viscous stress */
const WGSL_P2G_2 = /* wgsl */ `${WGSL_COMMON}
struct Cell { vx: atomic<i32>, vy: atomic<i32>, vz: atomic<i32>, mass: i32, }
const STIFFNESS: f32 = 50.0;
const REST_DENSITY: f32 = ${REST_DENSITY.toFixed(1)};
const VISCOSITY: f32 = 0.1;
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> cells: array<Cell>;
@group(0) @binding(2) var<uniform> sim: Sim;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= sim.count) { return; }
  let particle = particles[id.x];
  let base = floor(particle.position);
  var weights = quadraticWeights(particle.position - (base + 0.5));
  var density = 0.0;
  for (var gx = 0; gx < 3; gx++) { for (var gy = 0; gy < 3; gy++) { for (var gz = 0; gz < 3; gz++) {
    let cell = base + vec3f(f32(gx), f32(gy), f32(gz)) - 1.0;
    density += decodeFixed(cells[cellIndex(cell, sim)].mass) * weights[gx].x * weights[gy].y * weights[gz].z;
  } } }
  let pressure = max(0.0, STIFFNESS * (density / REST_DENSITY - 1.0));
  var stress = mat3x3f(-pressure, 0.0, 0.0, 0.0, -pressure, 0.0, 0.0, 0.0, -pressure);
  stress += VISCOSITY * (particle.C + transpose(particle.C));
  let term = -(1.0 / density) * 4.0 * sim.dt * stress;
  for (var gx = 0; gx < 3; gx++) { for (var gy = 0; gy < 3; gy++) { for (var gz = 0; gz < 3; gz++) {
    let weight = weights[gx].x * weights[gy].y * weights[gz].z;
    let cell = base + vec3f(f32(gx), f32(gy), f32(gz)) - 1.0;
    let momentum = (term * weight) * ((cell + 0.5) - particle.position);
    let i = cellIndex(cell, sim);
    atomicAdd(&cells[i].vx, encodeFixed(momentum.x));
    atomicAdd(&cells[i].vy, encodeFixed(momentum.y));
    atomicAdd(&cells[i].vz, encodeFixed(momentum.z));
  } } }
}`;

/** The grid: momentum to velocity, gravity, the walls – and the body, which moves the water inside it with it */
const WGSL_UPDATE_GRID = /* wgsl */ `${WGSL_COMMON}${WGSL_BODY}
struct Cell { vx: i32, vy: i32, vz: i32, mass: i32, }
const GRAVITY: f32 = 0.4;
/** The share of the grid's motion kept per step: the water settles to a flat surface between the toy's dips */
const DAMPING: f32 = 0.995;
const MARGIN: f32 = ${MARGIN.toFixed(1)};
const PUSH: f32 = 0.5;
@group(0) @binding(0) var<storage, read_write> cells: array<Cell>;
@group(0) @binding(1) var<uniform> sim: Sim;
@group(0) @binding(2) var<uniform> body: Body;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&cells) || cells[id.x].mass <= 0) { return; }
  let gy = i32(sim.grid.y);
  let gz = i32(sim.grid.z);
  let x = i32(id.x) / gz / gy;
  let y = (i32(id.x) / gz) % gy;
  let z = i32(id.x) % gz;
  var v = vec3f(decodeFixed(cells[id.x].vx), decodeFixed(cells[id.x].vy), decodeFixed(cells[id.x].vz)) / decodeFixed(cells[id.x].mass);
  v = v * DAMPING;
  v.y -= GRAVITY * sim.dt;
  if (body.solid > 0.5) {
    let q = (body.toBody * (vec3f(f32(x), f32(y), f32(z)) + 0.5 - body.center)) / body.radii;
    let r = length(q);
    if (r < 1.0) {
      let normal = normalize(transpose(body.toBody) * (q / body.radii) + vec3f(0.0, 1e-6, 0.0));
      v = body.velocity + normal * (1.0 - r) * PUSH;
    }
  }
  // The inside's walls are hard: a cell beyond one lets no water out through it (it slides along)
  let centre = vec3f(f32(x), f32(y), f32(z)) + 0.5;
  v = select(v, max(v, vec3f(0.0)), centre < vec3f(MARGIN));
  v = select(v, min(v, vec3f(0.0)), centre > sim.size - MARGIN);
  cells[id.x].vx = encodeFixed(v.x);
  cells[id.x].vy = encodeFixed(v.y);
  cells[id.x].vz = encodeFixed(v.z);
}`;

/** Grid to particles: the velocity and its gradient, the move, the walls – and out of the body to its surface */
const WGSL_G2P = /* wgsl */ `${WGSL_COMMON}${WGSL_BODY}
struct Cell { vx: i32, vy: i32, vz: i32, mass: i32, }
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> cells: array<Cell>;
@group(0) @binding(2) var<uniform> sim: Sim;
@group(0) @binding(3) var<uniform> body: Body;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= sim.count) { return; }
  let particle = particles[id.x];
  let base = floor(particle.position);
  var weights = quadraticWeights(particle.position - (base + 0.5));
  var v = vec3f(0.0);
  var B = mat3x3f(vec3f(0.0), vec3f(0.0), vec3f(0.0));
  for (var gx = 0; gx < 3; gx++) { for (var gy = 0; gy < 3; gy++) { for (var gz = 0; gz < 3; gz++) {
    let weight = weights[gx].x * weights[gy].y * weights[gz].z;
    let cell = base + vec3f(f32(gx), f32(gy), f32(gz)) - 1.0;
    let i = cellIndex(cell, sim);
    let w = vec3f(decodeFixed(cells[i].vx), decodeFixed(cells[i].vy), decodeFixed(cells[i].vz)) * weight;
    let d = (cell + 0.5) - particle.position;
    B += mat3x3f(w * d.x, w * d.y, w * d.z);
    v += w;
  } } }
  var p = particle.position + v * sim.dt;
  if (body.solid > 0.5) {
    let q = (body.toBody * (p - body.center)) / body.radii;
    let r = length(q);
    if (r < 1.0 && r > 1e-4) {
      p = body.center + transpose(body.toBody) * ((q / r) * body.radii);
      let normal = normalize(transpose(body.toBody) * (q / body.radii));
      let into = dot(v - body.velocity, normal);
      if (into < 0.0) { v -= into * normal; }
    }
  }
  // The walls: no particle leaves the inside
  let wallMin = vec3f(${(MARGIN + WALL_GAP).toFixed(2)});
  let wallMax = sim.size - ${(MARGIN + WALL_GAP).toFixed(2)};
  p = clamp(p, wallMin, wallMax);
  // At a wall a particle keeps no speed out through it
  v = select(v, max(v, vec3f(0.0)), p <= wallMin);
  v = select(v, min(v, vec3f(0.0)), p >= wallMax);
  particles[id.x].position = p;
  particles[id.x].v = v;
  particles[id.x].C = B * 4.0;
}`;

/**
 * The water's height over the floor, per column of cells: the highest particle standing on each column, averaged over
 * the neighbouring columns (a column at a wall weighed by the part of it inside), plus most of a particle's radius – the
 * surface. The composite draws the water against the glass up to it – a clean waterline – and trims the grains that
 * stand above it at the glass.
 */
const WGSL_COLUMNS = /* wgsl */ `${WGSL_COMMON}
const MARGIN: f32 = ${MARGIN.toFixed(1)};
const RADIUS: f32 = ${(DIAMETER * 0.2).toFixed(2)};
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> counts: array<atomic<u32>>; // the highest particle per column (y × 1000)
@group(0) @binding(2) var<uniform> sim: Sim;
@group(0) @binding(3) var<storage, read_write> heights: array<f32>;
@compute @workgroup_size(64) fn reset(@builtin(global_invocation_id) id: vec3u) {
  if (id.x < arrayLength(&counts)) { atomicStore(&counts[id.x], 0u); }
}
@compute @workgroup_size(64) fn tally(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= sim.count) { return; }
  let p = particles[id.x].position;
  atomicMax(&counts[u32(p.x) * u32(sim.grid.z) + u32(p.z)], u32(p.y * 1000.0));
}
@compute @workgroup_size(64) fn average(@builtin(global_invocation_id) id: vec3u) {
  let gz = i32(sim.grid.z);
  if (id.x >= arrayLength(&heights)) { return; }
  let i = i32(id.x) / gz;
  let k = i32(id.x) % gz;
  var water = 0.0;
  var area = 0.0;
  for (var di = -1; di <= 1; di++) { for (var dk = -1; dk <= 1; dk++) {
    let ii = i + di;
    let kk = k + dk;
    let wx = min(f32(ii + 1), sim.size.x - MARGIN) - max(f32(ii), MARGIN);
    let wz = min(f32(kk + 1), sim.size.z - MARGIN) - max(f32(kk), MARGIN);
    let top = f32(atomicLoad(&counts[ii * gz + kk])) / 1000.0;
    if (wx > 0.0 && wz > 0.0 && top > 0.0) {
      water += top * wx * wz;
      area += wx * wz;
    }
  } }
  heights[id.x] = select(MARGIN, water / max(area, 1e-3) + RADIUS, area > 0.0);
}`;

/** The render uniforms: texel size, particle diameter and the camera, in cells */
const WGSL_RENDER = /* wgsl */ `
struct RenderUniforms {
  texelSize: vec2f, sphereSize: f32,
  invProjectionMatrix: mat4x4f, projectionMatrix: mat4x4f, viewMatrix: mat4x4f, invViewMatrix: mat4x4f,
}`;

/** One triangle over the whole target; the fragment shaders take their pixel from the position */
const WGSL_SCREEN = /* wgsl */ `
struct Screen { @builtin(position) position: vec4f, @location(0) uv: vec2f, }
@vertex fn vs(@builtin(vertex_index) i: u32) -> Screen {
  var corners = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = corners[i];
  return Screen(vec4f(p, 0.0, 1.0), vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5));
}`;

/** A camera-facing square per particle, as a sphere: its view depth (depth map) or its thickness (additive) */
const WGSL_SPLATS = /* wgsl */ `${WGSL_RENDER}
struct Particle { position: vec3f, v: vec3f, C: mat3x3f, }
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uniforms: RenderUniforms;
struct Splat { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) view: vec3f, }
@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Splat {
  var corners = array(vec2f(0.5, 0.5), vec2f(0.5, -0.5), vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, -0.5), vec2f(-0.5, 0.5));
  let corner = corners[v];
  let view = (uniforms.viewMatrix * vec4f(particles[i].position, 1.0)).xyz;
  return Splat(uniforms.projectionMatrix * vec4f(view + vec3f(corner * uniforms.sphereSize, 0.0), 1.0), corner + 0.5, view);
}
struct DepthOut { @location(0) depth: f32, @builtin(frag_depth) fragDepth: f32, }
@fragment fn depth(@location(0) uv: vec2f, @location(1) view: vec3f) -> DepthOut {
  let xy = uv * 2.0 - 1.0;
  let r2 = dot(xy, xy);
  if (r2 > 1.0) { discard; }
  let surface = vec4f(view + vec3f(xy, sqrt(1.0 - r2)) * uniforms.sphereSize * 0.5, 1.0);
  let clip = uniforms.projectionMatrix * surface;
  return DepthOut(surface.z, clip.z / clip.w);
}
@fragment fn thickness(@location(0) uv: vec2f) -> @location(0) vec4f {
  let xy = uv * 2.0 - 1.0;
  let r2 = dot(xy, xy);
  if (r2 > 1.0) { discard; }
  return vec4f(vec3f(0.05 * sqrt(1.0 - r2)), 1.0);
}`;

/** The narrow-range filter (Truong and Yuksel): smooths the depth map without blurring across depth gaps */
const WGSL_NARROW_RANGE = /* wgsl */ `${WGSL_SCREEN}
struct Blur { direction: vec2f, particleConstant: f32, }
@group(0) @binding(0) var depthTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> blur: Blur;
const MAX_FILTER_SIZE: f32 = 50.0;
const MU: f32 = 1.8;
const THRESHOLD: f32 = 6.0;
fn depthAt(p: vec2f) -> f32 {
  let last = vec2i(textureDimensions(depthTexture)) - 1;
  return abs(textureLoad(depthTexture, clamp(vec2i(floor(p)), vec2i(0), last), 0).r);
}
fn accept(sampled: f32, low: ptr<function, f32>, high: ptr<function, f32>, upper: f32) -> vec2f {
  // (the depth to use, 1 = weighed / 0 = dropped): nearer than the range drops the pair, further counts as the bound
  if (sampled < *low) { return vec2f(sampled, 0.0); }
  if (sampled > *high) { return vec2f(upper, 1.0); }
  *low = min(*low, sampled - THRESHOLD);
  *high = max(*high, sampled + THRESHOLD);
  return vec2f(sampled, 1.0);
}
@fragment fn oneD(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let depth = depthAt(position.xy);
  if (depth >= 1e4) { return vec4f(depth, 0.0, 0.0, 1.0); }
  let size = i32(min(MAX_FILTER_SIZE, ceil(blur.particleConstant / depth)));
  let sigmaInv = 1.0 / (2.0 * pow(f32(size) / 2.0, 2.0));
  let upper = depth + MU;
  var lowA = depth - THRESHOLD; var highA = depth + THRESHOLD;
  var lowB = depth - THRESHOLD; var highB = depth + THRESHOLD;
  var sum = depth;
  var wsum = 1.0;
  for (var r = 1; r <= size; r++) {
    let a = accept(depthAt(position.xy - f32(r) * blur.direction), &lowA, &highA, upper);
    let b = accept(depthAt(position.xy + f32(r) * blur.direction), &lowB, &highB, upper);
    let w = exp(-f32(r * r) * sigmaInv) * a.y * b.y;
    sum += (a.x + b.x) * w;
    wsum += 2.0 * w;
  }
  return vec4f(sum / wsum, 0.0, 0.0, 1.0);
}
@fragment fn twoD(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let depth = depthAt(position.xy);
  if (depth >= 1e4) { return vec4f(depth, 0.0, 0.0, 1.0); }
  let size = i32(min(MAX_FILTER_SIZE, ceil(blur.particleConstant / depth)));
  let sigmaInv = 1.0 / (2.0 * pow(f32(size) / 2.0, 2.0));
  let upper = depth + MU;
  var low = depth - THRESHOLD; var high = depth + THRESHOLD;
  var sum = depth;
  var wsum = 1.0;
  for (var r = 1; r <= 2; r++) {
    for (var i = 0; i < 2 * r; i++) {
      let g = exp((-f32(r * r) + f32((r - i) * (r - i))) * sigmaInv);
      var offsets = array(vec2f(-f32(r), -f32(r - i)), vec2f(f32(r), f32(r - i)), vec2f(-f32(r - i), -f32(r)), vec2f(f32(r - i), f32(r)));
      var d: array<vec2f, 4>;
      for (var n = 0; n < 4; n++) { d[n] = accept(depthAt(position.xy + offsets[n]), &low, &high, upper); }
      let pairA = g * d[0].y * d[1].y;
      let pairB = g * d[2].y * d[3].y;
      sum += (d[0].x + d[1].x) * pairA + (d[2].x + d[3].x) * pairB;
      wsum += 2.0 * (pairA + pairB);
    }
  }
  return vec4f(sum / wsum, 0.0, 0.0, 1.0);
}`;

/** A separable gaussian over the thickness map (half resolution) */
const WGSL_GAUSSIAN = /* wgsl */ `${WGSL_SCREEN}
struct Blur { direction: vec2f, particleConstant: f32, }
@group(0) @binding(0) var thicknessTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> blur: Blur;
const SIZE: i32 = 15;
@fragment fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let last = vec2i(textureDimensions(thicknessTexture)) - 1;
  let at = vec2i(position.xy);
  let thickness = textureLoad(thicknessTexture, at, 0).r;
  if (thickness == 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let sigmaInv = 1.0 / (2.0 * pow(f32(SIZE) / 3.0, 2.0));
  var sum = thickness;
  var wsum = 1.0;
  for (var x = 1; x <= SIZE; x++) {
    let step = vec2i(blur.direction * f32(x));
    let w = exp(-f32(x * x) * sigmaInv);
    sum += (textureLoad(thicknessTexture, clamp(at - step, vec2i(0), last), 0).r + textureLoad(thicknessTexture, clamp(at + step, vec2i(0), last), 0).r) * w;
    wsum += 2.0 * w;
  }
  return vec4f(sum / wsum, 0.0, 0.0, 1.0);
}`;

/**
 * The fluid over the scene, per pixel along its ray through the inside: where the ray enters the glass below the water's
 * height (the columns), flat water against the glass; elsewhere Splash's free surface – its normal from the smoothed
 * depth, a fresnel reflection of a room (a bright ceiling, the desk below) where it meets the air, a highlight. The colour
 * by the thickness the ray runs through. Splash refracts a picture behind the fluid; here the scene behind is three.js's,
 * so the fluid is drawn with alpha – how much of what lies behind it hides – and the colour premultiplied, gamma-encoded
 * (the 8-bit canvas keeps the darks; the water material decodes it). Where the toy stands in front of the water, nothing
 * of the water behind it shows.
 */
const WGSL_FLUID = /* wgsl */ `${WGSL_SCREEN}${WGSL_RENDER}${WGSL_BODY}
struct Shade { colour: vec3f, density: f32, inside: vec3f, settled: f32, columns: vec2f, }
@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var depthTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(3) var thicknessTexture: texture_2d<f32>;
@group(0) @binding(4) var<uniform> shade: Shade;
@group(0) @binding(5) var<uniform> body: Body;
@group(0) @binding(6) var<storage, read> heights: array<f32>;
const LIGHT = vec3f(0.35, 1.0, 0.45);
const MARGIN: f32 = ${MARGIN.toFixed(1)};
const TINT: f32 = 0.06;
const EDGE_LOW: f32 = 0.1;
const EDGE_HIGH: f32 = 0.6;
// The thickness map's value per cell a ray runs through the water (its splats overlapping), for the water at the glass
const PATH_THICKNESS: f32 = 0.4;
fn viewAt(uv: vec2f, depth: f32) -> vec3f {
  var ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - 2.0 * uv.y, 0.0, 1.0);
  ndc.z = -uniforms.projectionMatrix[2].z + uniforms.projectionMatrix[3].z / depth;
  let eye = uniforms.invProjectionMatrix * ndc;
  return eye.xyz / eye.w;
}
fn depthAt(p: vec2i) -> f32 {
  let last = vec2i(textureDimensions(depthTexture)) - 1;
  return abs(textureLoad(depthTexture, clamp(p, vec2i(0), last), 0).r);
}
fn room(direction: vec3f) -> vec3f {
  let up = clamp(direction.y, -1.0, 1.0);
  return select(mix(vec3f(0.62, 0.66, 0.7), vec3f(0.22, 0.2, 0.18), -up), mix(vec3f(0.62, 0.66, 0.7), vec3f(1.0, 0.99, 0.97), up), up >= 0.0);
}
// The water's height (cells) over a point of the floor: the columns' heights, bilinear between their centres
fn waterHeight(x: f32, z: f32) -> f32 {
  let gx = i32(shade.columns.x);
  let gz = i32(shade.columns.y);
  let fx = clamp(x - 0.5, MARGIN, shade.inside.x - 1.0);
  let fz = clamp(z - 0.5, MARGIN, shade.inside.z - 1.0);
  let i = i32(floor(fx));
  let k = i32(floor(fz));
  let i1 = min(i + 1, gx - 1);
  let k1 = min(k + 1, gz - 1);
  let t = vec2f(fx - f32(i), fz - f32(k));
  return mix(mix(heights[i * gz + k], heights[i1 * gz + k], t.x), mix(heights[i * gz + k1], heights[i1 * gz + k1], t.x), t.y);
}
// The toy's body in front of the water hides it (its thin fins are not tested: a fin's ellipsoid would cut holes)
fn hiddenByBody(origin: vec3f, direction: vec3f, distance: f32) -> bool {
  let o = (body.toBody * (origin - body.center)) / body.radii;
  let d = (body.toBody * direction) / body.radii;
  let a = dot(d, d);
  let b = dot(o, d);
  let disc = b * b - a * (dot(o, o) - 1.0);
  if (disc < 0.0) { return false; }
  let t = (-b - sqrt(disc)) / a;
  return t > 0.0 && t < distance;
}
// Water a ray runs through: what it keeps of the light by the thickness – a light tint where thin, deeper where thick –
// drawn over the scene as a darker, saturated colour with that much alpha; a reflection and a highlight on top
fn water(thickness: f32, fresnel: f32, reflection: vec3f, diffuse: f32, specular: f32, edge: f32) -> vec4f {
  let transmittance = exp(-shade.density * 10.0 * thickness * (1.0 - shade.colour));
  let absorbed = clamp(1.0 - dot(transmittance, vec3f(1.0 / 3.0)) + TINT, 0.0, 0.6);
  let colour = reflection * fresnel + shade.colour * shade.colour * (0.6 + 0.4 * diffuse) * absorbed * (1.0 - fresnel) + vec3f(specular);
  let cover = clamp(fresnel + absorbed * (1.0 - fresnel) + specular, 0.0, 1.0);
  let straight = clamp(colour / max(cover, 1e-4), vec3f(0.0), vec3f(1.0));
  let alpha = cover * edge;
  return vec4f(pow(straight, vec3f(1.0 / 2.2)) * alpha, alpha);
}
@fragment fn fs(@builtin(position) position: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let thickness = textureSample(thicknessTexture, linearSampler, uv).r;
  let at = vec2i(position.xy);
  let depth = depthAt(at);
  // The pixel's ray in cells, and where it runs through the inside
  let ray = normalize(viewAt(uv, 1.0));
  let origin = (uniforms.invViewMatrix * vec4f(0.0, 0.0, 0.0, 1.0)).xyz;
  let direction = (uniforms.invViewMatrix * vec4f(ray, 0.0)).xyz;
  let a = (vec3f(MARGIN) - origin) / direction;
  let b = (shade.inside - origin) / direction;
  let near = max(max(min(a.x, b.x), min(a.y, b.y)), min(a.z, b.z));
  let far = min(min(max(a.x, b.x), max(a.y, b.y)), max(a.z, b.z));
  if (far < max(near, 0.0)) { return vec4f(0.0); }
  // Through the glass below the waterline: flat water against the glass, as deep as the ray runs below the surface
  let entry = origin + direction * near;
  let level = waterHeight(entry.x, entry.z);
  if (near > 0.0 && entry.y < shade.inside.y - 1e-3 && entry.y < level) {
    var leave = far;
    if (direction.y > 1e-4) { leave = min(far, near + (level - entry.y) / direction.y); }
    return water((leave - near) * PATH_THICKNESS, 0.0, vec3f(0.0), 0.5, 0.0, 1.0);
  }
  // Else the free surface, Splash's: its normal from the smoothed depth
  if (depth >= 1e4) { return vec4f(0.0); }
  let surface = viewAt(uv, depth);
  let texel = uniforms.texelSize;
  var ddx = viewAt(uv + vec2f(texel.x, 0.0), depthAt(at + vec2i(1, 0))) - surface;
  var ddy = viewAt(uv + vec2f(0.0, texel.y), depthAt(at + vec2i(0, 1))) - surface;
  let ddx2 = surface - viewAt(uv - vec2f(texel.x, 0.0), depthAt(at - vec2i(1, 0)));
  let ddy2 = surface - viewAt(uv - vec2f(0.0, texel.y), depthAt(at - vec2i(0, 1)));
  ddx = select(ddx, ddx2, abs(ddx.z) > abs(ddx2.z));
  ddy = select(ddy, ddy2, abs(ddy.z) > abs(ddy2.z));
  let normal = -normalize(cross(ddx, ddy));
  let distance = length(surface);
  // The splats reach a little past the walls: a surface the ray meets only beyond the inside is no water in the tank
  if (distance > far + 0.05) { return vec4f(0.0); }
  if (body.solid > 0.5 && hiddenByBody(origin, direction, distance)) { return vec4f(0.0); }
  // A particle standing above the water by the glass is the surface's grain, not a wave: the waterline stays clean
  let cell = origin + direction * distance;
  let wall = min(min(cell.x - MARGIN, shade.inside.x - cell.x), min(cell.z - MARGIN, shade.inside.z - cell.z));
  let grain = mix(1.0, 1.0 - smoothstep(0.2, 0.8, cell.y - waterHeight(cell.x, cell.z)), 1.0 - smoothstep(1.5, 2.5, wall));
  let light = normalize((uniforms.viewMatrix * vec4f(LIGHT, 0.0)).xyz);
  // Only the free surface meets the air: where the water lies against the glass it reflects nothing of the room
  let open = smoothstep(0.35, 0.8, (uniforms.invViewMatrix * vec4f(normal, 0.0)).y);
  let specular = open * pow(max(0.0, dot(normalize(light - ray), normal)), 300.0);
  let diffuse = max(0.0, dot(light, normal));
  let fresnel = open * clamp(0.02 + 0.98 * pow(1.0 - max(dot(normal, -ray), 0.0), 5.0), 0.0, 1.0);
  let reflection = room(normalize((uniforms.invViewMatrix * vec4f(reflect(ray, normal), 0.0)).xyz));
  // The free surface's outline (seen edgewise, a splash) fades where the fluid is thin: soft, not frayed
  let edge = smoothstep(EDGE_LOW, EDGE_HIGH, thickness) * grain;
  return water(thickness, fresnel * edge, reflection, diffuse, specular * edge, edge);
}`;

/** The fluid of one tank: its pipelines, buffers and size-dependent targets; the tank writes the uniforms, then `frame` */
interface Splash {
  readonly canvas: HTMLCanvasElement;
  /** The render uniforms (texel size, diameter, the camera – `RenderUniforms`), 68 floats */
  readonly uniforms: Float32Array;
  /** The body (`Body`), 24 floats */
  readonly body: Float32Array;
  /** The water's colour (linear) and density, then the inside's far corner (`Shade`) */
  readonly shade: Float32Array;
  /** The canvas' size in pixels; true when it changed */
  resize(width: number, height: number): boolean;
  /** One step of the simulation (`dt` in Splash's time) and the picture, submitted */
  frame(dt: number, particleConstant: number): void;
  dispose(): void;
}

/** One WebGPU device for every tank, asked for with the first one; null without WebGPU (no adapter, an error) */
let gpuDevice: Promise<Gpu | null> | null = null;
const navigatorGpu = (): Gpu | null => (typeof navigator === "undefined" ? null : ((navigator as unknown as { gpu?: Gpu }).gpu ?? null));
const requestGpu = (): Promise<Gpu | null> => {
  gpuDevice ??= (async () => {
    const adapter = await navigatorGpu()?.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    // A lost device is asked for anew by the next tank built
    device.lost.then(() => { gpuDevice = null; });
    return device;
  })().catch(() => null);
  return gpuDevice;
};

/** The fluid of one tank on `device`: pipelines compiled asynchronously (no stall), particles at rest in its domain */
const createSplash = async (device: Gpu, domain: SplashDomain): Promise<Splash> => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context: Gpu = canvas.getContext("webgpu");
  if (!context) throw new Error("no WebGPU canvas");
  const format = navigatorGpu().getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "premultiplied" });

  const modules = new Map<string, Gpu>();
  const shader = (code: string) => modules.get(code) ?? modules.set(code, device.createShaderModule({ code })).get(code);
  const computePipeline = (code: string) => device.createComputePipelineAsync({ layout: "auto", compute: { module: shader(code), entryPoint: "main" } });
  const renderPipeline = (code: string, vertex: string, fragment: string, targetFormat: string, extra: Record<string, unknown> = {}, blend?: unknown) => device.createRenderPipelineAsync({
    layout: "auto",
    vertex: { module: shader(code), entryPoint: vertex },
    fragment: { module: shader(code), entryPoint: fragment, targets: [{ format: targetFormat, ...(blend ? { blend } : {}) }] },
    primitive: { topology: "triangle-list" },
    ...extra,
  });
  const additive = { color: { operation: "add", srcFactor: "one", dstFactor: "one" }, alpha: { operation: "add", srcFactor: "one", dstFactor: "one" } };
  const columnPipeline = (entryPoint: string) => device.createComputePipelineAsync({ layout: "auto", compute: { module: shader(WGSL_COLUMNS), entryPoint } });
  const [clearColumns, countColumns, smoothColumns] = await Promise.all(["reset", "tally", "average"].map(columnPipeline));
  const [clearGrid, p2g1, p2g2, updateGrid, g2p, depthMap, filter1d, filter2d, thicknessMap, gaussian, fluid] = await Promise.all([
    computePipeline(WGSL_CLEAR),
    computePipeline(WGSL_P2G_1),
    computePipeline(WGSL_P2G_2),
    computePipeline(WGSL_UPDATE_GRID),
    computePipeline(WGSL_G2P),
    renderPipeline(WGSL_SPLATS, "vs", "depth", "r32float", { depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth32float" } }),
    renderPipeline(WGSL_NARROW_RANGE, "vs", "oneD", "r32float"),
    renderPipeline(WGSL_NARROW_RANGE, "vs", "twoD", "r32float"),
    renderPipeline(WGSL_SPLATS, "vs", "thickness", "r16float", {}, additive),
    renderPipeline(WGSL_GAUSSIAN, "vs", "fs", "r16float"),
    renderPipeline(WGSL_FLUID, "vs", "fs", format),
  ]);

  const buffer = (size: number, usage: number) => device.createBuffer({ size, usage });
  const cellCount = domain.grid[0] * domain.grid[1] * domain.grid[2];
  const particleBuffer = buffer(80 * domain.count, BUFFER.STORAGE | BUFFER.COPY_DST);
  const cellBuffer = buffer(16 * cellCount, BUFFER.STORAGE | BUFFER.COPY_DST);
  const simBuffer = buffer(32, BUFFER.UNIFORM | BUFFER.COPY_DST);
  const bodyBuffer = buffer(96, BUFFER.UNIFORM | BUFFER.COPY_DST);
  const renderBuffer = buffer(272, BUFFER.UNIFORM | BUFFER.COPY_DST);
  const shadeBuffer = buffer(48, BUFFER.UNIFORM | BUFFER.COPY_DST);
  const blurX = buffer(16, BUFFER.UNIFORM | BUFFER.COPY_DST);
  const blurY = buffer(16, BUFFER.UNIFORM | BUFFER.COPY_DST);
  const columnCount = domain.grid[0] * domain.grid[2];
  const countBuffer = buffer(4 * columnCount, BUFFER.STORAGE);
  const heightBuffer = buffer(4 * columnCount, BUFFER.STORAGE);
  device.queue.writeBuffer(particleBuffer, 0, splashParticles(domain));

  const sim = new ArrayBuffer(32);
  const simFloats = new Float32Array(sim);
  simFloats.set([...domain.grid], 0);
  new Uint32Array(sim)[3] = domain.count;
  simFloats.set([...domain.size], 4);
  const uniforms = new Float32Array(68);
  const body = new Float32Array(24);
  // The colour and density (set by the tank), the inside's far corner, the columns across x and z
  const shade = new Float32Array(12);
  shade.set(domain.size.map(v => v - MARGIN), 4);
  shade[8] = domain.grid[0];
  shade[9] = domain.grid[2];
  const blur = new Float32Array(4);

  const group = (pipeline: Gpu, resources: unknown[]) => device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    // A buffer binds as { buffer }, a texture view or a sampler as it is
    entries: resources.map((resource, binding) => ({ binding, resource: "mapState" in (resource as object) ? { buffer: resource } : resource })),
  });
  const clearGroup = group(clearGrid, [cellBuffer]);
  const p2g1Group = group(p2g1, [particleBuffer, cellBuffer, simBuffer]);
  const p2g2Group = group(p2g2, [particleBuffer, cellBuffer, simBuffer]);
  const updateGroup = group(updateGrid, [cellBuffer, simBuffer, bodyBuffer]);
  const g2pGroup = group(g2p, [particleBuffer, cellBuffer, simBuffer, bodyBuffer]);
  const depthGroup = group(depthMap, [particleBuffer, renderBuffer]);
  const thicknessGroup = group(thicknessMap, [particleBuffer, renderBuffer]);
  const clearColumnsGroup = device.createBindGroup({ layout: clearColumns.getBindGroupLayout(0), entries: [{ binding: 1, resource: { buffer: countBuffer } }] });
  const countColumnsGroup = device.createBindGroup({
    layout: countColumns.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: particleBuffer } }, { binding: 1, resource: { buffer: countBuffer } }, { binding: 2, resource: { buffer: simBuffer } }],
  });
  const smoothColumnsGroup = device.createBindGroup({
    layout: smoothColumns.getBindGroupLayout(0),
    entries: [{ binding: 1, resource: { buffer: countBuffer } }, { binding: 2, resource: { buffer: simBuffer } }, { binding: 3, resource: { buffer: heightBuffer } }],
  });
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  /** The targets at the canvas' size (the thickness at half of it) and the bind groups that read them */
  let targets: { textures: Gpu[]; views: Record<string, Gpu>; groups: Record<string, Gpu> } | null = null;
  const texture = (width: number, height: number, textureFormat: string) => device.createTexture({ size: [width, height, 1], format: textureFormat, usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING });
  const resize = (width: number, height: number): boolean => {
    if (targets && canvas.width === width && canvas.height === height) return false;
    targets?.textures.forEach(t => t.destroy());
    canvas.width = width;
    canvas.height = height;
    const half = [Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2))];
    const textures = [
      texture(width, height, "r32float"), texture(width, height, "r32float"), texture(width, height, "depth32float"),
      texture(half[0], half[1], "r16float"), texture(half[0], half[1], "r16float"),
    ];
    const [depth, depthSwap, depthTest, thickness, thicknessSwap] = textures.map(t => t.createView());
    targets = {
      textures,
      views: { depth, depthSwap, depthTest, thickness, thicknessSwap },
      groups: {
        filter1dX: group(filter1d, [depth, blurX]), filter1dY: group(filter1d, [depthSwap, blurY]),
        filter2dX: group(filter2d, [depth, blurX]), filter2dY: group(filter2d, [depthSwap, blurY]),
        gaussianX: group(gaussian, [thickness, blurX]), gaussianY: group(gaussian, [thicknessSwap, blurY]),
        fluid: group(fluid, [sampler, depth, renderBuffer, thickness, shadeBuffer, bodyBuffer, heightBuffer]),
      },
    };
    return true;
  };

  const workgroups = (n: number) => Math.ceil(n / 64);
  const pass = (encoder: Gpu, view: Gpu, pipeline: Gpu, bindGroup: Gpu, clear: number, vertices = 3, instances = 1, depthView?: Gpu) => {
    const descriptor: Record<string, unknown> = { colorAttachments: [{ view, clearValue: { r: clear, g: 0, b: 0, a: clear ? 1 : 0 }, loadOp: "clear", storeOp: "store" }] };
    if (depthView) descriptor.depthStencilAttachment = { view: depthView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" };
    const encoderPass = encoder.beginRenderPass(descriptor);
    encoderPass.setPipeline(pipeline);
    encoderPass.setBindGroup(0, bindGroup);
    encoderPass.draw(vertices, instances);
    encoderPass.end();
  };

  const frame = (dt: number, particleConstant: number): void => {
    if (!targets) return;
    const { views, groups } = targets;
    simFloats[7] = dt;
    device.queue.writeBuffer(simBuffer, 0, sim);
    device.queue.writeBuffer(bodyBuffer, 0, body);
    device.queue.writeBuffer(renderBuffer, 0, uniforms);
    device.queue.writeBuffer(shadeBuffer, 0, shade);
    blur[0] = 1;
    blur[1] = 0;
    blur[2] = particleConstant;
    device.queue.writeBuffer(blurX, 0, blur);
    blur[0] = 0;
    blur[1] = 1;
    device.queue.writeBuffer(blurY, 0, blur);
    const encoder = device.createCommandEncoder();
    // One substep of MLS-MPM (Splash needs no more)
    const compute = encoder.beginComputePass();
    const dispatch = (pipeline: Gpu, bindGroup: Gpu, n: number) => {
      compute.setPipeline(pipeline);
      compute.setBindGroup(0, bindGroup);
      compute.dispatchWorkgroups(workgroups(n));
    };
    dispatch(clearGrid, clearGroup, cellCount);
    dispatch(p2g1, p2g1Group, domain.count);
    dispatch(p2g2, p2g2Group, domain.count);
    dispatch(updateGrid, updateGroup, cellCount);
    dispatch(g2p, g2pGroup, domain.count);
    // The water's height per column, for the waterline at the glass
    dispatch(clearColumns, clearColumnsGroup, columnCount);
    dispatch(countColumns, countColumnsGroup, domain.count);
    dispatch(smoothColumns, smoothColumnsGroup, columnCount);
    compute.end();
    // The screen-space fluid: depth, narrow-range filtered (two 1D rounds, one 2D), thickness blurred, the composite
    pass(encoder, views.depth, depthMap, depthGroup, 1e6, 6, domain.count, views.depthTest);
    for (let round = 0; round < 2; round++) {
      pass(encoder, views.depthSwap, filter1d, groups.filter1dX, 1e6);
      pass(encoder, views.depth, filter1d, groups.filter1dY, 1e6);
    }
    pass(encoder, views.depthSwap, filter2d, groups.filter2dX, 1e6);
    pass(encoder, views.depth, filter2d, groups.filter2dY, 1e6);
    pass(encoder, views.thickness, thicknessMap, thicknessGroup, 0, 6, domain.count);
    pass(encoder, views.thicknessSwap, gaussian, groups.gaussianX, 0);
    pass(encoder, views.thickness, gaussian, groups.gaussianY, 0);
    pass(encoder, context.getCurrentTexture().createView(), fluid, groups.fluid, 0);
    device.queue.submit([encoder.finish()]);
  };

  return {
    canvas,
    uniforms,
    body,
    shade,
    resize,
    frame,
    dispose: () => {
      targets?.textures.forEach(t => t.destroy());
      [particleBuffer, cellBuffer, simBuffer, bodyBuffer, renderBuffer, shadeBuffer, blurX, blurY, countBuffer, heightBuffer].forEach(b => b.destroy());
      context.unconfigure();
    },
  };
};

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

  // ── the water: waves on the top of a mesh, a tint by depth and angle; a heightfield or a fluid when a tank hands one over ──
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
      // The WebGPU fluid (#228), set by the aquarium: its picture (premultiplied, gamma-encoded) over the viewport it was
      // rendered for, sampled where the mesh's front faces are
      fluidMap: { value: null as InstanceType<typeof three.Texture> | null },
      hasFluid: { value: 0 },
      fluidViewport: { value: new three.Vector4(0, 0, 1, 1) },
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
        uniform float hasFluid;
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
          } else if (hasFluid < 0.5) {
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
        uniform sampler2D fluidMap;
        uniform float hasFluid;
        uniform vec4 fluidViewport;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vToCamera;
        varying vec3 vLightView;
        varying vec3 vUpView;
        varying float vDepth;
        varying float vTop;
        void main() {
          if (hasFluid > 0.5) {
            // The WebGPU fluid where the mesh's front faces are: the pixel of its picture, premultiplied and gamma-encoded
            if (!gl_FrontFacing) discard;
            vec4 fluid = texture2D(fluidMap, (gl_FragCoord.xy - fluidViewport.xy) / fluidViewport.zw);
            if (fluid.a < 0.004) discard;
            gl_FragColor = vec4(pow(fluid.rgb / fluid.a, vec3(2.2)), fluid.a);
          } else {
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
              // Refraction-like: the view bent by a tilted patch runs a longer or shorter way through the water than
              // through the flat surface – deeper or clearer
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
          }
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

  // The WebGPU row says whether this browser runs the fluid: known at once when it has no WebGPU, else once the first
  // tank asked for a device (the Entity panel reads the row's label when it shows the node)
  const browser = typeof document !== "undefined";
  const gpuRow = {
    kind: "boolean" as const,
    default: true,
    label: browser && !navigatorGpu() ? "no WebGPU" : "WebGPU",
    description: "The water as a particle fluid on the GPU (Splash's MLS-MPM in WebGPU) that the toy pushes aside; off, the heightfield above. The row says what this browser has: WebGPU ok – on, the fluid runs; no WebGPU – the heightfield runs either way.",
  };

  api.registerNodeType("aquarium", {
    description: "A glass tank with a sandy floor, water and fish, and a toy fish (or a ball) that dips into the water – a WebGPU particle fluid where the browser has WebGPU, else a simulated surface with rings – y up, its floor at the node's origin (stand it on the page with rotation [90, 0, 0]).",
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
      simulate: { kind: "boolean", default: true, label: "simulation", description: "The heightfield (without the WebGPU fluid): the surface simulated, rings where the toy dips. Off: the water's static waves." },
      grid: { kind: "choice", options: ["32", "64", "96"], default: "64", label: "grid", description: "Cells of the heightfield along the tank's longer side: finer rings, more work per frame." },
      damping: { kind: "number", default: 1.2, min: 0, max: 6, step: 0.1, unit: "/s", label: "damping", description: "How fast the heightfield's rings settle: the share of their motion lost per second." },
      splash: { kind: "number", default: 4, min: 1, max: 12, step: 0.5, unit: "×", label: "splash", description: "How hard the toy pushes the water: in the heightfield the volume it displaces (1 = its own, true to size and faint at this scale – more makes the rings taller), in the fluid its push on the particles." },
      webgpu: gpuRow,
      particles: { kind: "choice", options: ["10k", "20k", "40k"], default: "20k", label: "particles", description: "The WebGPU fluid's particles: more make a finer surface and cost more GPU time per frame." },
      renderScale: { kind: "choice", options: ["0.5", "0.75", "1"], default: "0.75", label: "render scale", description: "The WebGPU fluid's picture against the view's pixels: smaller is cheaper and softer." },
      fluidColour: { kind: "color", default: "#8cdcf0", label: "fluid colour", description: "The WebGPU fluid's colour: what the water keeps of the light passing through it, the deeper the more." },
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

    // The floor: sand lit by the caustics, sampled twice and drifting against each other; with the heightfield the
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
    // heightfield its top has a vertex per cell; with the WebGPU fluid it is the whole inside up to the glass top, the
    // window the fluid shows through (splashes rise above the rest level)
    const waterGeometry = own(new three.BoxGeometry(innerX, waterHeight, innerZ, simulate ? cols : 32, 1, simulate ? rows : 18));
    const innerHeight = height - 0.004;
    const fluidGeometry = own(new three.BoxGeometry(innerX, innerHeight, innerZ));
    const water = new three.Mesh(waterGeometry, own(new three.MeshStandardMaterial({ color: "#5fb8d0", transparent: true, opacity: 0.35, depthWrite: false })));
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

    // ── the WebGPU fluid (#228): the domain, the device, the canvas and its texture, the path ──
    const wantsGpu = params.webgpu !== false;
    const domain = splashDomain({ x: innerX, y: innerHeight, z: innerZ }, [-innerX / 2, 0.002, -innerZ / 2], waterHeight, PARTICLES[String(params.particles)] ?? PARTICLES["20k"]);
    const renderScale = Number(params.renderScale) || 0.75;
    const fluidColour = new three.Color(String(params.fluidColour));
    let gpu: GpuStatus = wantsGpu && navigatorGpu() && browser ? "pending" : "missing";
    let fluid: Splash | null = null;
    let fluidTexture: InstanceType<typeof three.CanvasTexture> | null = null;
    let disposed = false;
    if (gpu === "pending") {
      requestGpu()
        .then(device => {
          if (!device) throw new Error("no WebGPU device");
          device.lost.then(() => { gpu = "failed"; gpuRow.label = "no WebGPU"; });
          return createSplash(device, domain);
        })
        .then(made => {
          if (disposed) return made.dispose();
          fluid = made;
          fluidTexture = new three.CanvasTexture(made.canvas);
          // The canvas is premultiplied already: the upload keeps its bytes, the material divides
          fluidTexture.premultiplyAlpha = true;
          fluidTexture.generateMipmaps = false;
          fluidTexture.minFilter = fluidTexture.magFilter = three.LinearFilter;
          gpu = "ready";
          gpuRow.label = "WebGPU ok";
        })
        .catch(error => {
          gpu = "failed";
          gpuRow.label = "no WebGPU";
          api.log("the WebGPU fluid did not start – the heightfield runs", error);
        });
    }

    /** The water's material uniforms when it is the water shader (another material keeps its own look) */
    const waterUniforms = () => (water.material as unknown as { uniforms?: Record<string, { value: unknown } | undefined> }).uniforms;
    let path: FluidPath = fluidPath({ webgpu: wantsGpu, gpu, material: false, simulate });
    /** The path now; a change swaps the water's box (the fluid's window is the whole inside) */
    const choosePath = (): FluidPath => {
      const next = fluidPath({ webgpu: wantsGpu, gpu, material: !!waterUniforms()?.hasFluid, simulate });
      if (next !== path) {
        path = next;
        const whole = path === "webgpu";
        water.geometry = whole ? fluidGeometry : waterGeometry;
        water.position.y = 0.002 + (whole ? innerHeight : waterHeight) / 2;
        floorUniforms.hasField.value = path === "heightfield" ? 1 : 0;
      }
      return path;
    };

    /** The water's material reads the heightfield or the fluid when it is the water shader */
    const handOver = () => {
      const u = waterUniforms();
      if (!u?.heightfield || !u.hasHeightfield) return;
      u.heightfield.value = field;
      u.hasHeightfield.value = path === "heightfield" ? 1 : 0;
      (u.fieldSize?.value as InstanceType<typeof three.Vector2> | undefined)?.set(innerX, innerZ);
      (u.fieldTexel?.value as InstanceType<typeof three.Vector2> | undefined)?.set(1 / cols, 1 / rows);
      if (u.surfaceTop) u.surfaceTop.value = waterHeight / 2;
      if (u.hasFluid && u.fluidMap) {
        u.hasFluid.value = path === "webgpu" ? 1 : 0;
        u.fluidMap.value = fluidTexture;
      }
    };

    // The hand-off, every frame the water is drawn: the scene's camera and the tank into Splash's uniforms, the body, one
    // step and the picture – once per frame (a frame may draw the scene twice, e.g. for the bloom); the viewport of
    // every draw, so the material finds its pixel in the picture
    let frame = 0;
    let drawn = -1;
    let frameDelta = 1 / 60;
    const camera = splashCamera(three, new three.Matrix4(), new three.Matrix4(), new three.Matrix4(), domain);
    const bufferSize = new three.Vector2();
    const turn = new three.Matrix4();
    water.onBeforeRender = (renderer, _scene, viewer) => {
      if (path !== "webgpu" || !fluid || !fluidTexture) return;
      const u = waterUniforms();
      renderer.getCurrentViewport(u?.fluidViewport?.value as InstanceType<typeof three.Vector4>);
      if (drawn === frame || (typeof document !== "undefined" && document.hidden)) return;
      drawn = frame;
      renderer.getDrawingBufferSize(bufferSize);
      const pixelsX = Math.max(1, Math.round(bufferSize.x * renderScale));
      const pixelsY = Math.max(1, Math.round(bufferSize.y * renderScale));
      // A new size is a new texture (three keeps a texture's storage at its first size)
      if (fluid.resize(pixelsX, pixelsY)) fluidTexture.dispose();
      splashCamera(three, viewer.matrixWorldInverse, viewer.projectionMatrix, tank.matrixWorld, domain, camera);
      const uniforms = fluid.uniforms;
      uniforms[0] = 1 / pixelsX;
      uniforms[1] = 1 / pixelsY;
      uniforms[2] = DIAMETER;
      uniforms.set(camera.invProjection.elements, 4);
      uniforms.set(camera.projection.elements, 20);
      uniforms.set(camera.view.elements, 36);
      uniforms.set(camera.invView.elements, 52);
      // The body: the toy's ellipsoid in cells, its turn, its speed in cells per Splash time
      const dt = Math.min(SIM_DT_MAX, SIM_DT * frameDelta * 60);
      const b = fluid.body;
      b[3] = hasToy ? 1 : 0;
      if (hasToy) {
        const s = domain.scale;
        toCells(domain, toy.position.x, toy.position.y, toy.position.z, b);
        b[4] = shape.a * s;
        b[5] = shape.b * s;
        b[6] = shape.c * s;
        const rise = (toyY(clock + 0.01) - toyY(clock - 0.01)) / 0.02;
        // `splash` scales how hard it pushes in, as it scales the volume it displaces in the heightfield; it rises as it is
        b[8] = 0;
        b[9] = dt > 0 ? (rise * s * frameDelta * (rise < 0 ? splash : 1)) / dt : 0;
        b[10] = 0;
        // Into the body's frame: the inverse of its turn, column by column (WGSL's mat3x3f pads each to four floats)
        const e = turn.makeRotationFromEuler(toy.rotation).transpose().elements;
        for (let column = 0; column < 3; column++) for (let row = 0; row < 3; row++) b[12 + column * 4 + row] = e[column * 4 + row];
      }
      fluid.shade[0] = fluidColour.r;
      fluid.shade[1] = fluidColour.g;
      fluid.shade[2] = fluidColour.b;
      fluid.shade[3] = FLUID_DENSITY;
      fluid.frame(dt, FILTER * DIAMETER * 0.05 * (pixelsY / 2) * camera.projection.elements[5]);
      fluidTexture.needsUpdate = true;
    };

    let pending = 0;
    const update = (delta: number) => {
      const frameTime = Math.min(delta, 0.25);
      frame++;
      frameDelta = frameTime;
      clock += frameTime;
      place();
      if (choosePath() === "heightfield") {
        pending += frameTime;
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
      swim(frameTime);
    };
    swim(0);
    place();
    // The simulations, for tests and for the curious in the console: `object.userData.waves` (the heightfield),
    // `object.userData.splash` (the fluid's domain, the path now, the pure hand-off and path choice)
    tank.userData.waves = waves;
    tank.userData.splash = {
      domain,
      path: () => path,
      fluidPath,
      particles: () => splashParticles(domain),
      cells: (x: number, y: number, z: number) => {
        const out = new Float32Array(3);
        toCells(domain, x, y, z, out);
        return Array.from(out);
      },
      camera: (cameraInverse: Matrix4, projection: Matrix4, tankWorld: Matrix4) => splashCamera(three, cameraInverse, projection, tankWorld, domain),
    };

    return {
      object: tank,
      update,
      // A tap pushes the toy into the water once
      onTap: () => {
        if (clock - pushedAt >= PUSH_SECONDS) pushedAt = clock;
      },
      // The fish's speed, the sand, the loop, the damping and the fluid's colour change in place; a new size, level,
      // school, toy, grid, simulation, particle count, render scale or WebGPU builds the tank anew
      tune: next => {
        if (["width", "depth", "height", "level", "fish", "grid"].some(key => Number(next[key]) !== Number(params[key]))) return false;
        if (String(next.body) !== kind || (next.simulate !== false) !== simulate || (next.webgpu !== false) !== wantsGpu) return false;
        if (String(next.particles) !== String(params.particles) || String(next.renderScale) !== String(params.renderScale)) return false;
        fishSpeed = Number(next.fishSpeed);
        floorUniforms.sand.value.set(String(next.sand));
        fluidColour.set(String(next.fluidColour));
        period = Number(next.period);
        dip = Number(next.dip);
        splash = Number(next.splash);
        keepPerStep = Math.exp(-Number(next.damping) * stepSeconds);
        return true;
      },
      dispose: () => {
        disposed = true;
        fluid?.dispose();
        fluidTexture?.dispose();
        disposables.forEach(thing => thing.dispose());
      },
    };
  });
};
