import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The stage's desk model (`editor/static/models/desk-eiermann.glb`, built by `editor/tools/desk-eiermann.py`), read
 * straight from the GLB: the Eiermann frame with two tops (#226), the meshes the stage expects, low-poly, every face
 * wound the way its normals point and facing outward, no duplicate or overlapping coplanar faces in what shows at once –
 * the frame and one top (they would fight in the depth buffer and show as a stray plane, #184) –, and a frame material
 * the scene's own lights can show. The linoleum top: the Eiermann top's outer size and surface, a thin linoleum layer
 * on an 18 mm board whose edges show one stack of plies (13 per 18 mm, like the plywood top's), oak underneath – no
 * drawers, no frame of its own.
 */
type Vec = [number, number, number];

interface Primitive {
  mesh: string;
  material: string;
  positions: Vec[];
  normals: Vec[];
  uvs: [number, number][];
  triangles: [number, number, number][];
}

interface Model {
  primitives: Primitive[];
  materials: Record<string, { doubleSided: boolean; metallic: number; roughness: number; color: Vec }>;
}

const readModel = (name: string): Model => {
  const file = readFileSync(resolve(process.cwd(), `static/models/${name}.glb`));
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = 20 + jsonLength + 8;
  const accessor = (index: number): number[] => {
    const a = json.accessors[index];
    const view = json.bufferViews[a.bufferView];
    const size = ({ SCALAR: 1, VEC2: 2, VEC3: 3 } as Record<string, number>)[a.type];
    const offset = bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const read = a.componentType === 5126 ? (i: number) => file.readFloatLE(offset + 4 * i)
      : a.componentType === 5125 ? (i: number) => file.readUInt32LE(offset + 4 * i)
        : (i: number) => file.readUInt16LE(offset + 2 * i);
    return Array.from({ length: a.count * size }, (_, i) => read(i));
  };
  const vectors = (values: number[]): Vec[] => Array.from({ length: values.length / 3 }, (_, i) => [values[3 * i], values[3 * i + 1], values[3 * i + 2]]);
  const pairs = (values: number[]): [number, number][] => Array.from({ length: values.length / 2 }, (_, i) => [values[2 * i], values[2 * i + 1]]);
  const primitives: Primitive[] = [];
  for (const mesh of json.meshes) {
    for (const p of mesh.primitives) {
      const indices = accessor(p.indices);
      primitives.push({
        mesh: mesh.name,
        material: json.materials[p.material].name,
        positions: vectors(accessor(p.attributes.POSITION)),
        normals: vectors(accessor(p.attributes.NORMAL)),
        uvs: p.attributes.TEXCOORD_0 === undefined ? [] : pairs(accessor(p.attributes.TEXCOORD_0)),
        triangles: Array.from({ length: indices.length / 3 }, (_, i) => [indices[3 * i], indices[3 * i + 1], indices[3 * i + 2]]),
      });
    }
  }
  const materials: Model["materials"] = {};
  for (const m of json.materials) {
    const pbr = m.pbrMetallicRoughness;
    materials[m.name] = { doubleSided: !!m.doubleSided, metallic: pbr?.metallicFactor ?? 1, roughness: pbr?.roughnessFactor ?? 1, color: (pbr?.baseColorFactor ?? [1, 1, 1]).slice(0, 3) as Vec };
  }
  return { primitives, materials };
};

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec) => Math.hypot(...a);
const unit = (v: Vec) => v.map(x => x / length(v)) as Vec;
const corners = (p: Primitive, t: [number, number, number]) => t.map(i => p.positions[i]) as [Vec, Vec, Vec];
/** The face's normal from its winding (counter-clockwise = front, as glTF and three.js have it), not normalised */
const windingNormal = ([a, b, c]: [Vec, Vec, Vec]) => cross(sub(b, a), sub(c, a));
const centroid = (points: Vec[]): Vec => points.reduce<Vec>((s, v) => [s[0] + v[0] / points.length, s[1] + v[1] / points.length, s[2] + v[2] / points.length], [0, 0, 0]);

/** The triangles of a primitive grouped into connected parts (vertices at the same position count as one) */
const parts = (p: Primitive): [number, number, number][][] => {
  const parent = p.positions.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { parent[find(a)] = find(b); };
  const byPosition = new Map<string, number>();
  p.positions.forEach((v, i) => {
    const key = v.map(x => x.toFixed(5)).join(",");
    const seen = byPosition.get(key);
    if (seen === undefined) byPosition.set(key, i);
    else join(i, seen);
  });
  p.triangles.forEach(([a, b, c]) => { join(a, b); join(a, c); });
  const groups = new Map<number, [number, number, number][]>();
  p.triangles.forEach(t => groups.set(find(t[0]), [...(groups.get(find(t[0])) ?? []), t]));
  return [...groups.values()];
};

const bounds = (points: Vec[]) => ({
  min: [0, 1, 2].map(k => Math.min(...points.map(v => v[k]))) as Vec,
  max: [0, 1, 2].map(k => Math.max(...points.map(v => v[k]))) as Vec,
});

/** Whether two coplanar triangles cover a common area (not just an edge or a corner) */
const overlapCoplanar = (a: [Vec, Vec, Vec], b: [Vec, Vec, Vec], normal: Vec): boolean => {
  // Project onto the plane's two axes that the normal leans on least
  const drop = [0, 1, 2].reduce((best, axis) => (Math.abs(normal[axis]) > Math.abs(normal[best]) ? axis : best), 0);
  const [u, v] = [0, 1, 2].filter(axis => axis !== drop);
  const flat = (t: [Vec, Vec, Vec]) => t.map(p => [p[u], p[v]] as [number, number]);
  const [ta, tb] = [flat(a), flat(b)];
  const area = (p: [number, number], q: [number, number], r: [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const eps = 1e-9;
  const inside = (pt: [number, number], t: [number, number][]) => {
    const s = Math.sign(area(t[0], t[1], t[2]));
    return [0, 1, 2].every(i => s * area(t[i], t[(i + 1) % 3], pt) > eps);
  };
  const mid = (t: [number, number][]): [number, number] => [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3];
  if (inside(mid(ta), tb) || inside(mid(tb), ta)) return true;
  if (ta.some(p => inside(p, tb)) || tb.some(p => inside(p, ta))) return true;
  // Edges that cross properly
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const [p, q] = [ta[i], ta[(i + 1) % 3]];
      const [r, s] = [tb[j], tb[(j + 1) % 3]];
      const d1 = area(p, q, r), d2 = area(p, q, s), d3 = area(r, s, p), d4 = area(r, s, q);
      if (d1 * d2 < -eps && d3 * d4 < -eps) return true;
    }
  }
  return false;
};

/** The tops (glTF is Y up, the tops' surface at y = 0) and their boards' thickness under the surface */
const TOPS = { TopEiermann: { materials: ["top", "edge"], thickness: 0.018 }, TopLinoleum: { materials: ["linoleum", "oak_edge", "oak"], thickness: 0.02 } } as const;
const HEIGHT = 0.72;

describe("the stage's desk model: the Eiermann frame with two tops (#226)", () => {
  const model = readModel("desk-eiermann");
  const of = (mesh: string, material?: string) => model.primitives.filter(p => p.mesh.replace(/\.\d+$/, "") === mesh && (!material || p.material === material));
  const triangles = (primitives: Primitive[]) => primitives.flatMap(p => p.triangles.map(t => ({ p, t, corners: corners(p, t) })));

  it("is the only desk: no other model in the folder (Schöpfer's desk went with #226)", () => {
    expect(readdirSync(resolve(process.cwd(), "static/models")).filter(f => f.endsWith(".glb"))).toEqual(["desk-eiermann.glb"]);
  });

  it("has the frame and both tops with the materials the stage expects, low-poly", () => {
    const meshes: Record<string, string[]> = {};
    model.primitives.forEach(p => (meshes[p.mesh.replace(/\.\d+$/, "")] ??= []).push(p.material));
    expect(meshes).toEqual({ Frame: ["steel"], TopEiermann: ["top", "edge"], TopLinoleum: ["linoleum", "oak_edge", "oak"] });
    expect(triangles(model.primitives)).toHaveLength(256);
    expect(triangles(of("TopLinoleum"))).toHaveLength(20);
  });

  it("winds every face the way its normals point, none degenerate", () => {
    for (const { p, t, corners: c } of triangles(model.primitives)) {
      const n = windingNormal(c);
      expect(length(n), `${p.mesh}/${p.material}`).toBeGreaterThan(1e-10);
      const shading = t.reduce<Vec>((s, i) => [s[0] + p.normals[i][0], s[1] + p.normals[i][1], s[2] + p.normals[i][2]], [0, 0, 0]);
      expect(dot(n, shading), `${p.mesh}/${p.material}`).toBeGreaterThan(0);
    }
  });

  it("turns the faces outward: the tubes', each top's and its edges'", () => {
    for (const p of of("Frame")) {
      for (const group of parts(p)) {
        // A tube's axis passes through the centroid of its part: a face looks outward when it faces away from it
        const centre = centroid([...new Set(group.flat())].map(i => p.positions[i]));
        for (const t of group) {
          const c = corners(p, t);
          expect(dot(windingNormal(c), sub(centroid(c), centre)), `${p.mesh}/${p.material}`).toBeGreaterThan(0);
        }
      }
    }
    for (const [name, top] of Object.entries(TOPS)) {
      const boardCentre: Vec = [0, -top.thickness / 2, 0];
      for (const { p, corners: c } of triangles(of(name))) {
        expect(dot(windingNormal(c), sub(centroid(c), boardCentre)), `${p.mesh}/${p.material}`).toBeGreaterThan(0);
      }
    }
  });

  it.each(Object.keys(TOPS))("has no duplicate or overlapping coplanar faces with the frame and %s shown (no stray plane, nothing to fight in the depth buffer)", top => {
    const shown = triangles([...of("Frame"), ...of(top)]);
    const overlaps: string[] = [];
    for (let i = 0; i < shown.length; i++) {
      for (let j = i + 1; j < shown.length; j++) {
        const [a, b] = [shown[i], shown[j]];
        const na = windingNormal(a.corners), nb = windingNormal(b.corners);
        const n = unit(na);
        if (Math.abs(dot(n, nb) / length(nb)) < 1 - 1e-6) continue;
        if (Math.abs(dot(n, sub(b.corners[0], a.corners[0]))) > 1e-5) continue;
        if (overlapCoplanar(a.corners, b.corners, n)) overlaps.push(`${a.p.mesh}/${a.p.material} #${i} – ${b.p.mesh}/${b.p.material} #${j}`);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("gives the frame a material the scene's own lights show: not a dark mirror, both sides of its open tubes", () => {
    const steel = model.materials.steel;
    // A metal shows almost only what it reflects: under the scene's lights (textured shading) or before a dark part of
    // the studio it turns as dark as the room behind it, and the thin tubes vanish
    expect(steel.metallic).toBeLessThanOrEqual(0.5);
    // Powder coat, not a mirror: rough enough that a light shows as a soft sheen
    expect(steel.roughness).toBeGreaterThanOrEqual(0.4);
    // The tubes are open at their ends: their insides must render where an end shows
    expect(steel.doubleSided).toBe(true);
  });

  it("stands 72 cm high: the frame reaches from the floor to under the tops", () => {
    const { min, max } = bounds(of("Frame").flatMap(p => p.positions));
    expect(min[1]).toBeCloseTo(-HEIGHT, 2);
    expect(max[1]).toBeLessThan(0);
  });

  it("gives both tops the same outer size and surface, so nothing on the stage moves when the top changes", () => {
    const eiermann = bounds(of("TopEiermann").flatMap(p => p.positions));
    const linoleum = bounds(of("TopLinoleum").flatMap(p => p.positions));
    for (const k of [0, 2]) {
      expect(linoleum.min[k]).toBeCloseTo(eiermann.min[k], 6);
      expect(linoleum.max[k]).toBeCloseTo(eiermann.max[k], 6);
    }
    expect(eiermann.max[1]).toBeCloseTo(0, 6);
    expect(linoleum.max[1]).toBeCloseTo(0, 6);
    expect(eiermann.max[0] - eiermann.min[0]).toBeCloseTo(1.8, 6);
    expect(eiermann.max[2] - eiermann.min[2]).toBeCloseTo(0.8, 6);
  });

  it("builds the linoleum top as linoleum on an 18 mm board: a thin linoleum line over the board's plies, all round", () => {
    const sides = (primitives: Primitive[]) => triangles(primitives).filter(({ corners: c }) => Math.abs(unit(windingNormal(c))[1]) < 0.5);
    const linoleumEdge = sides(of("TopLinoleum", "linoleum"));
    const lino = bounds(linoleumEdge.flatMap(({ corners: c }) => c));
    expect(lino.max[1]).toBeCloseTo(0, 6);
    expect(lino.max[1] - lino.min[1]).toBeGreaterThanOrEqual(0.0015);
    expect(lino.max[1] - lino.min[1]).toBeLessThanOrEqual(0.003);
    const plyEdge = sides(of("TopLinoleum", "oak_edge"));
    const board = bounds(plyEdge.flatMap(({ corners: c }) => c));
    expect(board.max[1]).toBeCloseTo(lino.min[1], 6);
    expect(board.max[1] - board.min[1]).toBeCloseTo(0.018, 6);
    // all round: the edge's faces look to all four sides; nothing else is oak_edge
    const directions = new Set(plyEdge.map(({ corners: c }) => { const n = unit(windingNormal(c)); return Math.abs(n[0]) > 0.5 ? Math.sign(n[0]) : 2 * Math.sign(n[2]); }));
    expect([...directions].sort((a, b) => a - b)).toEqual([-2, -1, 1, 2]);
    expect(triangles(of("TopLinoleum", "oak_edge"))).toHaveLength(plyEdge.length);
    // the oak veneer underneath, looking down; nothing hangs below the board (no drawers)
    const underside = triangles(of("TopLinoleum", "oak"));
    expect(underside.length).toBeGreaterThan(0);
    underside.forEach(({ corners: c }) => expect(unit(windingNormal(c))[1]).toBeCloseTo(-1, 6));
    expect(bounds(of("TopLinoleum").flatMap(p => p.positions)).min[1]).toBeCloseTo(-0.02, 6);
  });

  it("stacks the plies the same on both tops' edges: one stack (13 plies) through each 18 mm board", () => {
    for (const [mesh, material, bottom] of [["TopEiermann", "edge", -0.018], ["TopLinoleum", "oak_edge", -0.02]] as const) {
      for (const p of of(mesh, material)) {
        // v through the board: 0 at its underside and 1 at its upper face (the glTF export flips v: 1 - v)
        p.positions.forEach((position, i) => {
          const v = 1 - p.uvs[i][1];
          expect(v, `${mesh}/${material}`).toBeCloseTo((position[1] - bottom) / 0.018, 4);
        });
      }
    }
  });

  it("keeps the linoleum top's look in the stage's materials: linoleum blue-grey, the oak warm", () => {
    const { linoleum, oak, oak_edge: oakEdge } = model.materials;
    expect(linoleum.color[2]).toBeGreaterThan(linoleum.color[0]);
    expect(oak.color[0]).toBeGreaterThan(oak.color[2]);
    expect(oakEdge.color[0]).toBeGreaterThan(oakEdge.color[2]);
  });
});

describe("the overlap check itself", () => {
  const up: Vec = [0, 0, 1];
  const t = (...p: [number, number][]) => p.map(([x, y]) => [x, y, 0]) as [Vec, Vec, Vec];
  it("finds a duplicate and a partly covering face", () => {
    expect(overlapCoplanar(t([0, 0], [1, 0], [0, 1]), t([0, 0], [1, 0], [0, 1]), up)).toBe(true);
    expect(overlapCoplanar(t([0, 0], [1, 0], [0, 1]), t([0.2, 0.2], [2, 0.2], [0.2, 2]), up)).toBe(true);
  });
  it("lets the two halves of a quad and faces meeting at a corner pass", () => {
    expect(overlapCoplanar(t([0, 0], [1, 0], [1, 1]), t([0, 0], [1, 1], [0, 1]), up)).toBe(false);
    expect(overlapCoplanar(t([0, 0], [1, 0], [0, 1]), t([1, 0], [2, 0], [1, -1]), up)).toBe(false);
  });
});
