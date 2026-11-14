import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BufferGeometry, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { componentSpec, type EntityData, type Target } from "@engine/types";
import { applyComponents, installedPlugins, installPlugin, type PluginModule, uninstallPlugin } from "@engine/scene/plugins";
import { buildSheetGlb, SHEET_MODEL_PATH } from "../../../../tools/paper-sheet.mjs";
import { transpilePlugin } from "../compile";

/**
 * The demo's paper (#263): the real plugin (`fixtures/demo/plugins/paper`) registered through the engine and applied to
 * a plane as a video node has it, with the sheet the demo ships (`editor/tools/paper-sheet.mjs`) served by a stubbed
 * `fetch` – the model parameter's file goes through `api.loadModel` and three's glTF loader as in the app.
 */

const PAPER = readFileSync(resolve(process.cwd(), "../fixtures/demo/plugins/paper/index.ts"), "utf8");

const BENT = "https://cdn.example/assets/demo/sheet/v1.glb";
const FLAT = "https://cdn.example/assets/demo/flat/v1.glb";
const EMPTY = "https://cdn.example/assets/demo/empty/v1.glb";
const MISSING = "https://cdn.example/assets/demo/missing/v1.glb";

/** A .glb without a mesh */
const emptyGlb = (): Uint8Array => {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "nothing" }] }).padEnd(92, " "), "utf8");
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + json.length, 8);
  head.writeUInt32LE(json.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  return new Uint8Array(Buffer.concat([head, json]));
};

const files: Record<string, () => Uint8Array> = { [BENT]: () => buildSheetGlb(), [FLAT]: () => buildSheetGlb({ flat: true }), [EMPTY]: emptyGlb };

/** A video node's plane (width 1, the height its video's proportions) with the paper component on it */
const paperOn = (sheet: string | undefined) => {
  const plane = new PlaneGeometry(1, 1);
  const mesh = new Mesh<BufferGeometry>(plane, new MeshBasicMaterial());
  mesh.scale.set(1, 0.5625, 1);
  const node: EntityData = { type: "video", assets: [], components: [{ type: "paper", ...(sheet === undefined ? {} : { sheet }) }] };
  const target: Target = { id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity: node };
  const applied = applyComponents({ node, object: mesh, placed: mesh, children: [], target });
  const tune = (next: string) => applied.tune({ ...node, components: [{ type: "paper", sheet: next }] });
  return { mesh, plane, applied, tune };
};

/** The swap happens when the model has loaded: wait until the mesh shows another geometry (or give up) */
const swapped = async (mesh: Mesh<BufferGeometry>, from: BufferGeometry) => {
  for (let i = 0; i < 200 && mesh.geometry === from; i++) await new Promise(done => setTimeout(done, 5));
  return mesh.geometry !== from;
};
const settle = () => new Promise(done => setTimeout(done, 80));

const range = (geometry: BufferGeometry, axis: 0 | 1 | 2) => {
  const position = geometry.getAttribute("position");
  const values = Array.from({ length: position.count }, (_, i) => position.getComponent(i, axis));
  return [Math.min(...values), Math.max(...values)];
};

beforeEach(async () => {
  const result = await transpilePlugin(PAPER, "paper");
  if ("error" in result) throw new Error(result.error.message);
  const body = `${result.code.replace(/^export const register\b/m, "const register")}\nreturn register;`;
  installPlugin("paper", { register: new Function(body)() } as PluginModule);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const file = files[String(url)];
    return file ? new Response(file().slice().buffer, { status: 200 }) : new Response("", { status: 404, statusText: "Not Found" });
  }));
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the demo book's sheet (editor/tools/paper-sheet.mjs)", () => {
  it("is the file the script writes – regenerate it with `node editor/tools/paper-sheet.mjs`", () => {
    const file = readFileSync(resolve(process.cwd(), "..", SHEET_MODEL_PATH));
    expect(Buffer.from(file).equals(Buffer.from(buildSheetGlb()))).toBe(true);
    expect(file.length).toBeLessThan(6_000);
  });
});

describe("the paper component (#263)", () => {
  it("registers paper for videos and images with one row: the sheet, a model file", () => {
    const spec = componentSpec("paper");
    expect(spec?.nodeTypes).toEqual(["video", "image"]);
    expect(spec?.params).toEqual({ sheet: expect.objectContaining({ kind: "model", default: "" }) });
  });

  it("puts the sheet in the plane's place, fitted to it: 1 × 1 around the centre, slightly bent, lying on the plane", async () => {
    const { mesh, plane } = paperOn(BENT);
    expect(mesh.geometry).toBe(plane); // until the file is there
    expect(await swapped(mesh, plane)).toBe(true);
    const sheet = mesh.geometry;
    expect(sheet.getAttribute("position").count).toBe(81);
    expect(range(sheet, 0).map(v => +v.toFixed(4))).toEqual([-0.5, 0.5]);
    expect(range(sheet, 1).map(v => +v.toFixed(4))).toEqual([-0.5, 0.5]);
    const [low, high] = range(sheet, 2);
    expect(low).toBeCloseTo(0);
    expect(high).toBeGreaterThan(0.03);
    expect(high).toBeLessThan(0.15);
    // The node's own fit to its video stays: the engine scales the mesh, not the geometry
    expect(mesh.scale.toArray()).toEqual([1, 0.5625, 1]);
    expect(sheet.getAttribute("normal").count).toBe(81);
  });

  it("keeps the picture as a plane shows it: every vertex where its UV says, the triangles facing the viewer", async () => {
    const { mesh, plane } = paperOn(FLAT);
    expect(await swapped(mesh, plane)).toBe(true);
    const position = mesh.geometry.getAttribute("position");
    const uv = mesh.geometry.getAttribute("uv");
    for (let i = 0; i < position.count; i++) {
      expect(position.getX(i)).toBeCloseTo(uv.getX(i) - 0.5, 4);
      expect(position.getY(i)).toBeCloseTo(uv.getY(i) - 0.5, 4);
      expect(position.getZ(i)).toBeCloseTo(0, 4);
    }
    const index = mesh.geometry.getIndex()!;
    const [a, b, c] = [index.getX(0), index.getX(1), index.getX(2)];
    const cross = (position.getX(b) - position.getX(a)) * (position.getY(c) - position.getY(a)) - (position.getX(c) - position.getX(a)) * (position.getY(b) - position.getY(a));
    expect(cross).toBeGreaterThan(0);
    expect(mesh.geometry.getAttribute("normal").getZ(40)).toBeCloseTo(1);
  });

  it("takes another sheet or none in place", async () => {
    const { mesh, plane, tune } = paperOn(BENT);
    await swapped(mesh, plane);
    const bent = mesh.geometry;
    const disposed = vi.fn();
    bent.addEventListener("dispose", disposed);
    expect(tune(FLAT)).toBe(true);
    expect(await swapped(mesh, bent)).toBe(true);
    expect(range(mesh.geometry, 2)[1]).toBeCloseTo(0);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(tune("")).toBe(true);
    expect(mesh.geometry).toBe(plane);
  });

  it("stays flat without a sheet, with a file that is missing and with a model that holds no sheet", async () => {
    const none = paperOn(undefined);
    const missing = paperOn(MISSING);
    const empty = paperOn(EMPTY);
    await settle();
    expect(none.mesh.geometry).toBe(none.plane);
    expect(missing.mesh.geometry).toBe(missing.plane);
    expect(empty.mesh.geometry).toBe(empty.plane);
    const logged = vi.mocked(console.info).mock.calls.map(call => String(call[1]));
    expect(logged).toHaveLength(2);
    expect(logged).toEqual(expect.arrayContaining([expect.stringContaining("did not load"), expect.stringContaining("holds no mesh with UVs")]));
  });

  it("gives the plane back when the node goes, also when the file arrives after that", async () => {
    const shown = paperOn(BENT);
    await swapped(shown.mesh, shown.plane);
    const disposed = vi.fn();
    shown.mesh.geometry.addEventListener("dispose", disposed);
    shown.applied.parts.forEach(part => part.dispose?.());
    expect(shown.mesh.geometry).toBe(shown.plane);
    expect(disposed).toHaveBeenCalled();

    const late = paperOn(FLAT);
    late.applied.parts.forEach(part => part.dispose?.());
    await settle();
    expect(late.mesh.geometry).toBe(late.plane);
  });
});
