import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The stage's desk models (`editor/static/models/`, built by `editor/tools/desk-eiermann.py`), read straight from the
 * GLB: the meshes the stage expects, low-poly, every face wound the way its normals point and facing outward, no
 * duplicate or overlapping coplanar faces (they would fight in the depth buffer and show as a stray plane), and a frame
 * material the scene's own lights can show.
 */
type Vec = [number, number, number];

interface Primitive {
  mesh: string;
  material: string;
  positions: Vec[];
  normals: Vec[];
  triangles: [number, number, number][];
}

interface Model {
  primitives: Primitive[];
  materials: Record<string, { doubleSided: boolean; metallic: number; roughness: number }>;
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
  const primitives: Primitive[] = [];
  for (const mesh of json.meshes) {
    for (const p of mesh.primitives) {
      const indices = accessor(p.indices);
      primitives.push({
        mesh: mesh.name,
        material: json.materials[p.material].name,
        positions: vectors(accessor(p.attributes.POSITION)),
        normals: vectors(accessor(p.attributes.NORMAL)),
        triangles: Array.from({ length: indices.length / 3 }, (_, i) => [indices[3 * i], indices[3 * i + 1], indices[3 * i + 2]]),
      });
    }
  }
  const materials: Model["materials"] = {};
  for (const m of json.materials) {
    materials[m.name] = { doubleSided: !!m.doubleSided, metallic: m.pbrMetallicRoughness?.metallicFactor ?? 1, roughness: m.pbrMetallicRoughness?.roughnessFactor ?? 1 };
  }
  return { primitives, materials };
};

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec) => Math.hypot(...a);
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
  p.triangles.forEach(t => {
    const root = find(t[0]);
    groups.set(root, [...(groups.get(root) ?? []), t]);
  });
  return [...groups.values()];
};

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

const DESKS = {
  "desk-eiermann": { triangles: 236, meshes: { Frame: ["steel"], Top: ["top", "edge"] }, thickness: 0.018 },
  "desk-schoepfer": { triangles: 124, meshes: { Legs: ["steel"], Top: ["top", "drawer", "edge"] }, thickness: 0.06 },
} as const;

describe.each(Object.entries(DESKS))("the stage's desk model %s", (name, desk) => {
  const model = readModel(name);
  const triangles = model.primitives.flatMap(p => p.triangles.map(t => ({ p, t, corners: corners(p, t) })));

  it("has the meshes and materials the stage expects, low-poly", () => {
    const meshes: Record<string, string[]> = {};
    model.primitives.forEach(p => (meshes[p.mesh.replace(/\.\d+$/, "")] ??= []).push(p.material));
    expect(meshes).toEqual(desk.meshes);
    expect(triangles).toHaveLength(desk.triangles);
  });

  it("winds every face the way its normals point, none degenerate", () => {
    for (const { p, t, corners: c } of triangles) {
      const n = windingNormal(c);
      expect(length(n), `${p.mesh}/${p.material}`).toBeGreaterThan(1e-10);
      const shading = t.reduce<Vec>((s, i) => [s[0] + p.normals[i][0], s[1] + p.normals[i][1], s[2] + p.normals[i][2]], [0, 0, 0]);
      expect(dot(n, shading), `${p.mesh}/${p.material}`).toBeGreaterThan(0);
    }
  });

  it("turns the faces outward: the tubes', the top's and its edges' (the drawer cutouts' look inward)", () => {
    const boardCentre: Vec = [0, -desk.thickness / 2, 0];
    for (const p of model.primitives) {
      const groups = p.material === "steel" ? parts(p) : [p.triangles];
      for (const group of groups) {
        // A tube's axis passes through the centroid of its part: a face looks outward when it faces away from it
        const centre = p.material === "steel" ? centroid([...new Set(group.flat())].map(i => p.positions[i])) : boardCentre;
        for (const t of group) {
          const c = corners(p, t);
          const facing = dot(windingNormal(c), sub(centroid(c), centre));
          if (p.material === "drawer") continue;
          expect(facing, `${p.mesh}/${p.material}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("has no duplicate or overlapping coplanar faces (no stray plane, nothing to fight in the depth buffer)", () => {
    const overlaps: string[] = [];
    for (let i = 0; i < triangles.length; i++) {
      for (let j = i + 1; j < triangles.length; j++) {
        const [a, b] = [triangles[i], triangles[j]];
        const na = windingNormal(a.corners), nb = windingNormal(b.corners);
        const unit = na.map(x => x / length(na)) as Vec;
        if (Math.abs(dot(unit, nb) / length(nb)) < 1 - 1e-6) continue;
        if (Math.abs(dot(unit, sub(b.corners[0], a.corners[0]))) > 1e-5) continue;
        if (overlapCoplanar(a.corners, b.corners, unit)) overlaps.push(`${a.p.mesh}/${a.p.material} #${i} – ${b.p.mesh}/${b.p.material} #${j}`);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("gives the frame a material the scene's own lights show: not a dark mirror, both sides of its open tubes", () => {
    const steel = model.materials.steel;
    // A metal shows almost only what it reflects: under the scene's lights (textured shading) or before a dark part of
    // the studio it turns as dark as the room behind it, and the thin tubes vanish
    expect(steel.metallic).toBeLessThanOrEqual(0.5);
    // The tubes are open at their ends: their insides must render where an end shows
    expect(steel.doubleSided).toBe(true);
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
