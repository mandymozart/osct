/**
 * The demo experience's sheet of paper (`fixtures/demo/entries/screen/v1.glb` – the export's name for it, #322): a slightly bent plane the `paper` component
 * (`fixtures/demo/plugins/paper`) shows the screen's video on. Written as glTF 2.0 binary directly – no Blender, no
 * dependencies – so the file is the same on every machine and a test can rebuild it.
 *
 *     node editor/tools/paper-sheet.mjs [out.glb]
 *
 * Writes the demo's sheet (`v1.glb`) unless another path is given. The demo lives in the staging database (#322): a
 * changed sheet is uploaded in the editor, then the demo exported again.
 *
 * The file is laid out as a sheet comes out of Blender, so the component is tried on what an artist delivers: a plane of
 * 9 × 9 vertices lying on the floor (glTF's XZ plane, Y up), its near edge on the X axis, sized and turned by its node
 * (16 : 9, a few degrees about Y), the UVs 0–1 across it with the picture's top at the far edge. The bend is in the
 * mesh: the sheet bows up a little along its middle and one far corner lifts.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Vertices along each side */
const SIDE = 9;
/** The node's scale: the mesh spans 2 × 2, the sheet 3.2 × 1.8 (16 : 9) */
const NODE_SCALE = [1.6, 1, 0.9];
/** The node's turn about Y, in degrees */
const NODE_TURN = 12;

/** Rounded to 1e-4: the file stays the same whatever the platform's last float digits */
const round = (/** @type {number} */ n) => Math.round(n * 1e4) / 1e4 + 0;

/**
 * How high the sheet lies above the floor at (s, t) – s across (0 left, 1 right), t from the near edge (0) to the far
 * edge (1) – in the mesh's units: a bow of 0.14 along the middle, and the far right corner lifted by up to 0.2
 */
const lift = (/** @type {number} */ s, /** @type {number} */ t) => {
  const bow = 0.14 * Math.sin(Math.PI * s) * (0.7 + 0.3 * t);
  const corner = Math.max(0, s + t - 1.3) / 0.7;
  return bow + 0.2 * corner * corner;
};

/**
 * The sheet as a .glb: one node, one mesh (POSITION, NORMAL, TEXCOORD_0, indices), no material
 * @param {{ flat?: boolean }} [options] flat = the same sheet without its bend
 * @returns {Uint8Array}
 */
export const buildSheetGlb = ({ flat = false } = {}) => {
  /** @type {number[]} */ const positions = [];
  /** @type {number[]} */ const uvs = [];
  /** @type {number[]} */ const indices = [];
  for (let row = 0; row < SIDE; row++) {
    for (let column = 0; column < SIDE; column++) {
      const s = column / (SIDE - 1);
      const t = row / (SIDE - 1);
      positions.push(round(2 * s - 1), round(flat ? 0 : lift(s, t)), round(-2 * t));
      uvs.push(round(s), round(1 - t)); // glTF's v runs down the picture: its top (v = 0) at the far edge
    }
  }
  for (let row = 0; row < SIDE - 1; row++) {
    for (let column = 0; column < SIDE - 1; column++) {
      const a = row * SIDE + column;
      const b = a + 1;
      const c = a + SIDE;
      const d = c + 1;
      indices.push(a, b, d, a, d, c); // counter-clockwise seen from above
    }
  }
  // Vertex normals: the triangles' normals summed (weighted by their area), in the mesh's own space
  const normals = new Array(positions.length).fill(0);
  const point = (/** @type {number} */ i) => positions.slice(i * 3, i * 3 + 3);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [point(indices[i]), point(indices[i + 1]), point(indices[i + 2])];
    const [u, v] = [[b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const index of [indices[i], indices[i + 1], indices[i + 2]]) n.forEach((value, axis) => (normals[index * 3 + axis] += value));
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    for (let axis = 0; axis < 3; axis++) normals[i + axis] = round(normals[i + axis] / length);
  }

  /** @type {Buffer[]} */ const parts = [];
  /** @type {object[]} */ const bufferViews = [];
  /** @type {object[]} */ const accessors = [];
  let length = 0;
  const add = (/** @type {Buffer} */ data, /** @type {number} */ target, /** @type {object} */ accessor) => {
    const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
    data.copy(padded);
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, target });
    accessors.push({ bufferView: bufferViews.length - 1, ...accessor });
    parts.push(padded);
    length += padded.length;
  };
  const floats = (/** @type {number[]} */ values) => Buffer.from(new Float32Array(values).buffer);
  const range = (/** @type {number[]} */ values, /** @type {number} */ size) => ({
    min: Array.from({ length: size }, (_, axis) => Math.min(...values.filter((__, i) => i % size === axis))),
    max: Array.from({ length: size }, (_, axis) => Math.max(...values.filter((__, i) => i % size === axis))),
  });
  add(floats(positions), 34962, { componentType: 5126, count: positions.length / 3, type: "VEC3", ...range(positions, 3) });
  add(floats(normals), 34962, { componentType: 5126, count: normals.length / 3, type: "VEC3" });
  add(floats(uvs), 34962, { componentType: 5126, count: uvs.length / 2, type: "VEC2" });
  add(Buffer.from(new Uint16Array(indices).buffer), 34963, { componentType: 5123, count: indices.length, type: "SCALAR" });

  const half = (NODE_TURN * Math.PI) / 360;
  const json = {
    asset: { version: "2.0", generator: "osct editor/tools/paper-sheet.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "sheet", mesh: 0, rotation: [0, round(Math.sin(half)), 0, round(Math.cos(half))], scale: NODE_SCALE }],
    meshes: [{ name: "sheet", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3 }] }],
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

/** Where the demo experience keeps the sheet, from the repository's root */
export const SHEET_MODEL_PATH = "fixtures/demo/entries/screen/v1.glb";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] ?? fileURLToPath(new URL(`../../${SHEET_MODEL_PATH}`, import.meta.url));
  const glb = buildSheetGlb();
  writeFileSync(out, glb);
  console.log(`${out}: ${glb.length} bytes`);
}
