import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The stage's desk models (`editor/static/models/`, built by `editor/tools/desk-eiermann.py`), read straight from the
 * GLB: the meshes the stage expects, low-poly, every face wound the way its normals point and facing outward, no
 * duplicate or overlapping coplanar faces (they would fight in the depth buffer and show as a stray plane), and a frame
 * material the scene's own lights can show. Schöpfer's desk (#187): no plywood, a thin sandwich top with a linoleum
 * layer over an oak band, open oak drawers with a dark inside hanging under the front edge, a black matt frame.
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
    const pbr = m.pbrMetallicRoughness;
    materials[m.name] = { doubleSided: !!m.doubleSided, metallic: pbr?.metallicFactor ?? 1, roughness: pbr?.roughnessFactor ?? 1, color: (pbr?.baseColorFactor ?? [1, 1, 1]).slice(0, 3) as Vec };
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
const parts = (p: Primitive): [number, number, number][][] => meshParts([p]).map(part => part.map(({ t }) => t));

/** The triangles of one or more primitives (a mesh's materials) grouped into connected parts, across the primitives */
const meshParts = (primitives: Primitive[]): { p: Primitive; t: [number, number, number] }[][] => {
  const offsets = primitives.map((_, i) => primitives.slice(0, i).reduce((sum, q) => sum + q.positions.length, 0));
  const all = primitives.flatMap(p => p.positions);
  const parent = all.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { parent[find(a)] = find(b); };
  const byPosition = new Map<string, number>();
  all.forEach((v, i) => {
    const key = v.map(x => x.toFixed(5)).join(",");
    const seen = byPosition.get(key);
    if (seen === undefined) byPosition.set(key, i);
    else join(i, seen);
  });
  primitives.forEach((p, k) => p.triangles.forEach(([a, b, c]) => { join(offsets[k] + a, offsets[k] + b); join(offsets[k] + a, offsets[k] + c); }));
  const groups = new Map<number, { p: Primitive; t: [number, number, number] }[]>();
  primitives.forEach((p, k) => p.triangles.forEach(t => {
    const root = find(offsets[k] + t[0]);
    groups.set(root, [...(groups.get(root) ?? []), { p, t }]);
  }));
  return [...groups.values()];
};

/** The positions a group of triangles uses, each once */
const pointsOf = (group: { p: Primitive; t: [number, number, number] }[]): Vec[] => {
  const seen = new Map<string, Vec>();
  group.forEach(({ p, t }) => t.forEach(i => seen.set(p.positions[i].map(x => x.toFixed(5)).join(","), p.positions[i])));
  return [...seen.values()];
};
const area = (c: [Vec, Vec, Vec]) => length(windingNormal(c)) / 2;
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

/**
 * `outward`: how a face's outside is found – from the board's centre (the Eiermann's one slab), or from the centre of
 * the connected part it belongs to across its mesh's materials (Schöpfer's panel, each drawer, each frame box)
 */
const DESKS = {
  "desk-eiermann": { triangles: 236, meshes: { Frame: ["steel"], Top: ["top", "edge"] }, thickness: 0.018, height: 0.72, outward: "board" },
  "desk-schoepfer": { triangles: 256, meshes: { Drawers: ["oak", "drawer"], Frame: ["steel"], Top: ["linoleum", "oak", "aluminium"] }, thickness: 0.024, height: 0.75, outward: "parts" },
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

  it("turns the faces outward: the tubes', the top's and its edges' (the drawers' insides look inward)", () => {
    if (desk.outward === "parts") {
      for (const mesh of new Set(model.primitives.map(p => p.mesh))) {
        const primitives = model.primitives.filter(p => p.mesh === mesh);
        for (const group of meshParts(primitives)) {
          const centre = centroid(pointsOf(group));
          for (const { p, t } of group) {
            if (p.material === "drawer") continue;
            const c = corners(p, t);
            expect(dot(windingNormal(c), sub(centroid(c), centre)), `${p.mesh}/${p.material}`).toBeGreaterThan(0);
          }
        }
      }
      return;
    }
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
    // Powder coat, not a mirror: rough enough that a light shows as a soft sheen
    expect(steel.roughness).toBeGreaterThanOrEqual(0.4);
    // The tubes are open at their ends: their insides must render where an end shows
    expect(steel.doubleSided).toBe(true);
  });

  it(`stands ${desk.height * 100} cm high: the frame reaches from the floor to under the top`, () => {
    const frame = model.primitives.filter(p => p.material === "steel").flatMap(p => p.positions);
    const { min, max } = bounds(frame);
    expect(min[1]).toBeCloseTo(-desk.height, 2);
    expect(max[1]).toBeLessThan(0);
  });
});

describe("Schöpfer's desk (#187): a sandwich top, open oak drawers, a black frame", () => {
  const model = readModel("desk-schoepfer");
  const of = (mesh: string, material?: string) => model.primitives.filter(p => p.mesh.replace(/\.\d+$/, "") === mesh && (!material || p.material === material));
  const tris = (primitives: Primitive[]) => primitives.flatMap(p => p.triangles.map(t => corners(p, t)));
  const unit = (v: Vec) => v.map(x => x / length(v)) as Vec;
  // glTF is Y up; the model's front (the sitter's side, where the drawers are) is +z, the top's front edge at z = 0.4
  const FRONT = 0.4;

  it("is no plywood: linoleum and oak, no `top` or `edge` for the stage's plies", () => {
    const names = Object.keys(model.materials);
    expect(names).not.toContain("top");
    expect(names).not.toContain("edge");
    expect(names).toEqual(expect.arrayContaining(["linoleum", "oak", "drawer", "steel"]));
  });

  it("has a thin sandwich top: the linoleum a layer of its own over the whole top, the oak band under it", () => {
    const top = bounds(of("Top").flatMap(p => p.positions));
    expect(top.max[1]).toBeCloseTo(0, 5);
    expect(top.max[1] - top.min[1]).toBeLessThanOrEqual(0.03);
    // The linoleum's edge: a thin band (a few mm) at the top of the edge; the oak band below it, all round
    const linoleumEdge = tris(of("Top", "linoleum")).filter(c => Math.abs(unit(windingNormal(c))[1]) < 0.5).flat();
    const lino = bounds(linoleumEdge);
    expect(lino.max[1] - lino.min[1]).toBeGreaterThan(0.002);
    expect(lino.max[1] - lino.min[1]).toBeLessThanOrEqual(0.005);
    const oakEdge = tris(of("Top", "oak")).filter(c => Math.abs(unit(windingNormal(c))[1]) < 0.5);
    const band = bounds(oakEdge.flat());
    expect(band.max[1]).toBeCloseTo(lino.min[1], 5);
    // all round: the band's faces look to all four sides
    const sides = new Set(oakEdge.map(c => { const n = unit(windingNormal(c)); return Math.abs(n[0]) > 0.5 ? Math.sign(n[0]) * 1 : Math.sign(n[2]) * 2; }));
    expect([...sides].sort((a, b) => a - b)).toEqual([-2, -1, 1, 2]);
  });

  it("has three open drawers: oak boxes with walls, a bottom and a dark inside, hanging under the front edge", () => {
    const drawers = meshParts(of("Drawers"));
    expect(drawers).toHaveLength(3);
    const underside = bounds(of("Top").flatMap(p => p.positions)).min[1];
    for (const drawer of drawers) {
      const box = bounds(pointsOf(drawer));
      // under the top's panel line, and out over its front edge towards the sitter
      expect(box.max[1]).toBeLessThan(underside);
      expect(box.max[2]).toBeGreaterThan(FRONT);
      expect(box.min[2]).toBeLessThan(FRONT);
      // deep enough to read as a box: 40 mm or more of wall
      expect(box.max[1] - box.min[1]).toBeGreaterThanOrEqual(0.04);
      const inside = drawer.filter(({ p }) => p.material === "drawer").map(({ p, t }) => corners(p, t));
      const outside = drawer.filter(({ p }) => p.material === "oak").map(({ p, t }) => corners(p, t));
      // the dark inside: a bottom looking up and four walls looking inward
      const directions = new Set(inside.map(c => {
        const n = unit(windingNormal(c));
        return n[1] > 0.5 ? "up" : Math.abs(n[0]) > 0.5 ? `x${Math.sign(n[0])}` : `z${Math.sign(n[2])}`;
      }));
      expect([...directions].sort()).toEqual(["up", "x-1", "x1", "z-1", "z1"]);
      // oak outside: four walls and the bottom
      const footprint = (box.max[0] - box.min[0]) * (box.max[2] - box.min[2]);
      const below = outside.filter(c => unit(windingNormal(c))[1] < -0.5).reduce((sum, c) => sum + area(c), 0);
      expect(below).toBeCloseTo(footprint, 4);
      // open at the top: only the walls' thin edges look up at the box's top
      const lid = outside.filter(c => unit(windingNormal(c))[1] > 0.5).reduce((sum, c) => sum + area(c), 0);
      expect(lid).toBeLessThan(0.2 * footprint);
    }
  });

  it("gives the drawers a dark inside and the frame black, matt powder coat", () => {
    const luminance = ([r, g, b]: Vec) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance(model.materials.drawer.color)).toBeLessThan(0.05);
    expect(luminance(model.materials.oak.color)).toBeGreaterThan(0.2);
    const steel = model.materials.steel;
    expect(luminance(steel.color)).toBeLessThan(0.05);
    expect(steel.metallic).toBeLessThanOrEqual(0.2);
    expect(steel.roughness).toBeGreaterThanOrEqual(0.5);
  });

  it("stands on four legs splayed outward, each with a strut up to the rim's end", () => {
    // the frame's parts that reach the floor are the legs: four, their feet further out than their tops (both ways)
    const parts = meshParts(of("Frame"));
    const legs = parts.map(pointsOf).filter(points => bounds(points).min[1] < -0.7);
    expect(legs).toHaveLength(4);
    for (const points of legs) {
      const foot = centroid(points.filter(v => v[1] < -0.74));
      const head = centroid(points.filter(v => v[1] > -0.05));
      expect(Math.abs(foot[0])).toBeGreaterThan(Math.abs(head[0]) + 0.1);
      expect(Math.abs(foot[2])).toBeGreaterThan(Math.abs(head[2]));
    }
    // the struts: parts between the legs' height and the rim that reach out to the top's ends
    const struts = parts.map(pointsOf).filter(points => { const b = bounds(points); return b.min[1] > -0.3 && b.min[1] < -0.1; });
    expect(struts).toHaveLength(4);
    struts.forEach(points => expect(bounds(points).max[0] - bounds(points).min[0]).toBeGreaterThan(0.1));
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
