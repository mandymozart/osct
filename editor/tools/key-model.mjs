/**
 * The demo book's key (`fixtures/demo/entries/key/key.glb`): a small low-poly brass key with one animation clip,
 * `rattle`, which the `animation` component plays on a tap (`playOn: tap`). Written as glTF 2.0 binary directly –
 * no Blender, no dependencies – so the file is the same on every machine and a test can rebuild it.
 *
 *     node editor/tools/key-model.mjs [out.glb]
 *
 * Writes the demo's `key.glb` unless another path is given.
 *
 * The model, in glTF's axes (Y up, Z towards the viewer) and the content's units (1 = the target's width, before the
 * node's `scale`): the tip at the origin, the shaft up the Y axis, a collar, the bow a ring in the XY plane on top
 * (1 high in all), two teeth to the right at the bottom. One mesh, one material (`brass`), one node (`key`) that the
 * clip moves: the key rocks about its tip and hops a little, dying out over 0.9 s, and ends where it started.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/** @typedef {[number, number, number]} Vec3 */

/** Rounded to 1e-4: the file stays the same whatever the platform's last float digits */
const round = (/** @type {number} */ n) => Math.round(n * 1e4) / 1e4 + 0;

/** The mesh as it is built: positions, normals (3 floats a vertex) and triangle indices */
class MeshBuilder {
  /** @type {number[]} */ positions = [];
  /** @type {number[]} */ normals = [];
  /** @type {number[]} */ indices = [];

  /** @param {Vec3} p @param {Vec3} n */
  vertex(p, n) {
    this.positions.push(...p.map(round));
    this.normals.push(...n.map(round));
    return this.positions.length / 3 - 1;
  }

  /** An axis-aligned box with flat faces, counter-clockwise seen from outside @param {Vec3} min @param {Vec3} max */
  box(min, max) {
    const c = /** @type {Vec3} */ ([0, 1, 2].map(i => (min[i] + max[i]) / 2));
    const h = /** @type {Vec3} */ ([0, 1, 2].map(i => (max[i] - min[i]) / 2));
    // Per face: the normal's axis and sign, and two tangent axes u, v with u × v = the normal
    /** @type {Array<[number, number, number, number]>} */
    const faces = [[0, 1, 1, 2], [0, -1, 2, 1], [1, 1, 2, 0], [1, -1, 0, 2], [2, 1, 0, 1], [2, -1, 1, 0]];
    for (const [axis, sign, u, v] of faces) {
      /** @type {Vec3} */ const n = [0, 0, 0];
      n[axis] = sign;
      const corner = (/** @type {number} */ su, /** @type {number} */ sv) => {
        /** @type {Vec3} */ const p = [c[0], c[1], c[2]];
        p[axis] += sign * h[axis];
        p[u] += su * h[u];
        p[v] += sv * h[v];
        return this.vertex(p, n);
      };
      const a = corner(-1, -1), b = corner(1, -1), d = corner(1, 1), e = corner(-1, 1);
      this.indices.push(a, b, d, a, d, e);
    }
  }

  /**
   * A torus around the Z axis (a ring facing the viewer), smooth-shaded
   * @param {Vec3} centre @param {number} radius @param {number} tube @param {number} segments @param {number} sides
   */
  torus(centre, radius, tube, segments, sides) {
    const first = this.positions.length / 3;
    for (let i = 0; i < segments; i++) {
      const u = (i / segments) * Math.PI * 2;
      for (let j = 0; j < sides; j++) {
        const v = (j / sides) * Math.PI * 2;
        /** @type {Vec3} */ const n = [Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u), Math.sin(v)];
        const ring = radius + tube * Math.cos(v);
        this.vertex([centre[0] + ring * Math.cos(u), centre[1] + ring * Math.sin(u), centre[2] + tube * Math.sin(v)], n);
      }
    }
    const at = (/** @type {number} */ i, /** @type {number} */ j) => first + (i % segments) * sides + (j % sides);
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < sides; j++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        this.indices.push(a, b, c, a, c, d);
      }
    }
  }
}

/** The key's geometry */
const keyMesh = () => {
  const mesh = new MeshBuilder();
  mesh.box([-0.035, 0, -0.035], [0.035, 0.62, 0.035]); // the shaft
  mesh.box([-0.07, 0.56, -0.045], [0.07, 0.6, 0.045]); // the collar under the bow
  mesh.box([0.035, 0.04, -0.025], [0.2, 0.11, 0.025]); // the lower tooth
  mesh.box([0.035, 0.17, -0.025], [0.15, 0.23, 0.025]); // the upper tooth
  mesh.torus([0, 0.8, 0], 0.16, 0.045, 12, 6); // the bow
  return mesh;
};

/** The clip's length (s) and keys: the rock about the tip (degrees around Z) and the hop (up Y), dying out */
const RATTLE_SECONDS = 0.9;
const RATTLE_KEYS = 13;
const rattle = () => {
  /** @type {number[]} */ const times = [];
  /** @type {number[]} */ const rotations = [];
  /** @type {number[]} */ const translations = [];
  for (let k = 0; k < RATTLE_KEYS; k++) {
    const t = (k / (RATTLE_KEYS - 1)) * RATTLE_SECONDS;
    const fade = 1 - t / RATTLE_SECONDS;
    const degrees = 12 * Math.sin((2 * Math.PI * t) / 0.3) * fade;
    const half = (degrees * Math.PI) / 360;
    times.push(round(t));
    rotations.push(0, 0, round(Math.sin(half)), round(Math.cos(half)));
    translations.push(0, round(0.05 * Math.sin((Math.PI * t) / RATTLE_SECONDS)), 0);
  }
  return { times, rotations, translations };
};

/** The glTF binary of the key: header, the JSON chunk, the binary chunk @returns {Uint8Array} */
export const buildKeyGlb = () => {
  const mesh = keyMesh();
  const clip = rattle();
  /** @type {Buffer[]} */ const parts = [];
  /** @type {Array<{ buffer: number; byteOffset: number; byteLength: number; target?: number }>} */ const bufferViews = [];
  let length = 0;
  /** A buffer view of `data`, 4-byte aligned @param {Buffer} data @param {number} [target] */
  const view = (data, target) => {
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, ...(target ? { target } : {}) });
    const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
    data.copy(padded);
    parts.push(padded);
    length += padded.length;
    return bufferViews.length - 1;
  };
  const floats = (/** @type {number[]} */ values) => Buffer.from(new Float32Array(values).buffer);
  /** Per-component min and max of a flat list @param {number[]} values @param {number} size */
  const bounds = (values, size) => {
    const min = Array(size).fill(Infinity), max = Array(size).fill(-Infinity);
    values.forEach((value, i) => { min[i % size] = Math.min(min[i % size], value); max[i % size] = Math.max(max[i % size], value); });
    return { min: min.map(v => Math.fround(v)), max: max.map(v => Math.fround(v)) };
  };
  const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963, FLOAT = 5126, UNSIGNED_SHORT = 5123;
  const vertices = mesh.positions.length / 3;
  const accessors = [
    { bufferView: view(floats(mesh.positions), ARRAY_BUFFER), componentType: FLOAT, count: vertices, type: "VEC3", ...bounds(mesh.positions, 3) },
    { bufferView: view(floats(mesh.normals), ARRAY_BUFFER), componentType: FLOAT, count: vertices, type: "VEC3" },
    { bufferView: view(Buffer.from(new Uint16Array(mesh.indices).buffer), ELEMENT_ARRAY_BUFFER), componentType: UNSIGNED_SHORT, count: mesh.indices.length, type: "SCALAR" },
    { bufferView: view(floats(clip.times)), componentType: FLOAT, count: clip.times.length, type: "SCALAR", ...bounds(clip.times, 1) },
    { bufferView: view(floats(clip.rotations)), componentType: FLOAT, count: clip.times.length, type: "VEC4" },
    { bufferView: view(floats(clip.translations)), componentType: FLOAT, count: clip.times.length, type: "VEC3" },
  ];
  const json = {
    asset: { version: "2.0", generator: "OSCT editor/tools/key-model.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "key", mesh: 0 }],
    meshes: [{ name: "key", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: "brass", pbrMetallicRoughness: { baseColorFactor: [0.8, 0.62, 0.26, 1], metallicFactor: 1, roughnessFactor: 0.35 } }],
    animations: [{
      name: "rattle",
      samplers: [{ input: 3, output: 4, interpolation: "LINEAR" }, { input: 3, output: 5, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }, { sampler: 1, target: { node: 0, path: "translation" } }],
    }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: length }],
  };
  const text = Buffer.from(JSON.stringify(json), "utf8");
  const jsonChunk = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20);
  text.copy(jsonChunk);
  const binChunk = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHead = (/** @type {number} */ size, /** @type {number} */ type) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(size, 0);
    head.writeUInt32LE(type, 4);
    return head;
  };
  return new Uint8Array(Buffer.concat([header, chunkHead(jsonChunk.length, 0x4e4f534a), jsonChunk, chunkHead(binChunk.length, 0x004e4942), binChunk]));
};

/** Where the demo book keeps the key, from the repository's root */
export const KEY_MODEL_PATH = "fixtures/demo/entries/key/key.glb";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] ?? fileURLToPath(new URL(`../../${KEY_MODEL_PATH}`, import.meta.url));
  const glb = buildKeyGlb();
  writeFileSync(out, glb);
  console.log(`${out}: ${glb.length} bytes`);
}
