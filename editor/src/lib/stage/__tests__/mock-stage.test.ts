import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Box3, type Color, CustomBlending, DirectionalLight, type Group, type LineSegments, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, NormalBlending, OneFactor,
  OneMinusDstAlphaFactor, Scene, type SphereGeometry, Texture, Vector3,
} from "three";
import { MockStage } from "../mock-stage";

const page = { width: 230, height: 320 };
const book = { spreads: 10, format: "spread" as const };

const newStage = () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  const stage = new MockStage(new Scene(), path => `/${path}`);
  // the textures are not decoded here: record what is requested
  const requested: string[] = [];
  (stage as unknown as { loader: unknown }).loader = { setCrossOrigin: () => {}, load: (url: string) => { requested.push(url) } } as never;
  return { stage, requested };
};

const gridOf = (stage: MockStage) => (stage as unknown as { gridGroup: { children: LineSegments[] } }).gridGroup.children;

describe("mock stage: the grid", () => {
  it("draws nothing while off, and lines (plus the zero lines) while on", () => {
    const { stage } = newStage();
    stage.setLayout([], page, null, book);
    expect(gridOf(stage)).toHaveLength(0);
    stage.setGrid({ on: true, mm: 10, origin: "top-left", axis: false });
    const [lines, zeros] = gridOf(stage);
    // per page 23 vertical (x = 10 … 230) + 32 horizontal lines, two points each; the zero lines are separate
    expect(lines.geometry.getAttribute("position").count).toBe(2 * 2 * (23 + 32));
    expect(zeros.geometry.getAttribute("position").count).toBe(2 * 2 * 2);
    expect(gridOf(stage)).toHaveLength(2);
    stage.setGrid({ on: false, mm: 10, origin: "top-left", axis: true });
    expect(gridOf(stage)).toHaveLength(0);
  });

  it("counts both pages as one grid from the book's centre", () => {
    const { stage } = newStage();
    stage.setLayout([], page, null, book);
    stage.setGrid({ on: true, mm: 10, origin: "centre", axis: false });
    const [, zeros] = gridOf(stage);
    expect(zeros.geometry.getAttribute("position").count).toBe(2 * 2);
  });

  it("raises the vertical axis from each zero, out of the page, only with the grid (#190)", () => {
    const { stage } = newStage();
    stage.setLayout([], page, null, book);
    stage.setGrid({ on: false, mm: 10, origin: "centre", axis: true });
    expect(gridOf(stage)).toHaveLength(0);
    stage.setGrid({ on: true, mm: 10, origin: "centre", axis: true });
    const [, , vertical] = gridOf(stage);
    const position = vertical.geometry.getAttribute("position");
    // one line from the book's centre (the spine's middle) up along z
    expect(position.count).toBe(2);
    expect([position.getX(0), position.getY(0), position.getX(1), position.getY(1)]).toEqual([0, 0, 0, 0]);
    expect(position.getZ(1)).toBeCloseTo(0.15);
    // a corner origin: one per page, at each page's top left corner
    stage.setGrid({ on: true, mm: 10, origin: "top-left", axis: true });
    const corners = gridOf(stage)[2].geometry.getAttribute("position");
    expect(corners.count).toBe(4);
    expect([corners.getX(0), corners.getY(0)].map(v => +v.toFixed(3))).toEqual([-0.23, 0.16]);
    expect([corners.getX(2), corners.getY(2)].map(v => +v.toFixed(3))).toEqual([0, 0.16]);
  });
});

describe("mock stage: the snap guides (#190)", () => {
  const guidesOf = (stage: MockStage) => (stage as unknown as { guideGroup: { children: LineSegments[] } }).guideGroup.children;

  it("draws a line across the spread per guide, through everything, and clears them", () => {
    const { stage } = newStage();
    stage.setLayout([], page, null, book);
    stage.setGuides([{ axis: 0, at: 0 }, { axis: 1, at: 160 }, { axis: 2, at: 0 }]);
    const [lines] = guidesOf(stage);
    const position = lines.geometry.getAttribute("position");
    // x and y only: the height has no line on the page
    expect(position.count).toBe(4);
    expect([position.getY(0), position.getY(1)].map(v => +v.toFixed(3))).toEqual([-0.18, 0.18]);
    expect([position.getX(2), position.getX(3), position.getY(2)].map(v => +v.toFixed(3))).toEqual([-0.25, 0.25, 0.16]);
    expect((lines.material as { depthTest: boolean }).depthTest).toBe(false);
    stage.setGuides([]);
    expect(guidesOf(stage)).toHaveLength(0);
  });
});

describe("mock stage: the sharper sheet image", () => {
  const sheet = { image: "/s.jpg", imageSharp: "/s@sharp.jpg", widthMm: 460, heightMm: 320 };

  it("is fetched only once the base image is there and the camera is close, and only once", () => {
    const { stage, requested } = newStage();
    stage.setLayout([], page, sheet, book);
    expect(requested).toEqual(["/s.jpg"]);
    stage.setDetail(300);
    expect(requested).toEqual(["/s.jpg"]);
    const paper = (stage as unknown as { sheetPaper: { material: { map: unknown } } }).sheetPaper;
    paper.material.map = {};
    stage.setDetail(900);
    expect(requested).toEqual(["/s.jpg"]);
    stage.setDetail(300);
    stage.setDetail(200);
    expect(requested).toEqual(["/s.jpg", "/s@sharp.jpg"]);
  });
});

describe("mock stage: the viewport's shading (#137)", () => {
  it("puts the book and the desk in wireframe and solid, and gives their materials back", async () => {
    const { Mesh: MeshClass } = await import("three");
    const { stage } = newStage();
    stage.setLayout([], page, { image: "/s.jpg", widthMm: 460, heightMm: 320 }, book);
    const paper = (stage as unknown as { sheetPaper: InstanceType<typeof MeshClass> }).sheetPaper;
    const own = paper.material;
    stage.setShading("solid");
    expect(paper.material).not.toBe(own);
    stage.setShading("wireframe");
    expect((paper.material as { wireframe?: boolean }).wireframe).toBe(true);
    stage.setShading("textured");
    expect(paper.material).toBe(own);
  });

  it("builds a new layout in the current shading", () => {
    const { stage } = newStage();
    stage.setShading("solid");
    stage.setLayout([], page, { image: "/s.jpg", widthMm: 460, heightMm: 320 }, book);
    const paper = (stage as unknown as { sheetPaper: { material: { color: { getHex(): number } } } }).sheetPaper;
    expect(paper.material.color.getHex()).toBe(0xb4b4b4);
    stage.setShading("textured");
    expect(paper.material.color.getHex()).not.toBe(0xb4b4b4);
  });
});

describe("mock stage: the printed images and the placement (#191)", () => {
  /** A stage whose image loads are answered by hand: `answer(url, width, height)` decodes one */
  const printStage = () => {
    const { stage } = newStage();
    const loads = new Map<string, (texture: unknown) => void>();
    (stage as unknown as { loader: unknown }).loader = { setCrossOrigin: () => {}, load: (url: string, done: (t: unknown) => void) => { loads.set(url, done); } } as never;
    const answer = (url: string, width: number, height: number) => loads.get(url)?.({ image: { width, height }, dispose() {} });
    return { stage, answer };
  };
  const portrait = { id: "a", imageSrc: "/a.jpg", surface: "right", x: 70, y: 100, width: 80, height: 60 };

  it("scales one plane to the print: the image's aspect and a move resize it, and an outline on it follows", async () => {
    const { outline } = await import("../shading");
    const { stage, answer } = printStage();
    stage.setLayout([portrait], page, null, book);
    const [plane] = stage.printedPlanes();
    expect(plane.scale.x).toBeCloseTo(0.08, 6);
    expect(plane.scale.y).toBeCloseTo(0.06, 6); // the stored box until the image is known
    const lines = outline(plane, 0xffa028);
    const edges = plane.children[0];
    answer("/a.jpg", 1000, 1450);
    expect(plane.scale.y).toBeCloseTo(0.116, 6);
    expect(plane.position.y).toBeCloseTo((160 - 100 - 58) / 1000, 6);
    expect(stage.printedAspect("a")).toBeCloseTo(1.45, 6);
    stage.movePrint({ ...portrait, surface: "left", width: 40 });
    expect(stage.printedPlanes()[0]).toBe(plane);
    expect(plane.scale.x).toBeCloseTo(0.04, 6);
    expect(plane.scale.y).toBeCloseTo(0.058, 6);
    expect(plane.position.x).toBeCloseTo((-230 + 70 + 20) / 1000, 6);
    // The outline hangs on the plane: it is scaled and moved with it, never redrawn at the old size
    expect(plane.children[0]).toBe(edges);
    lines.remove();
  });

  it("keeps a print moved before its image arrived where it was moved", () => {
    const { stage, answer } = printStage();
    stage.setLayout([portrait], page, null, book);
    stage.movePrint({ ...portrait, x: 10 });
    answer("/a.jpg", 100, 100);
    const [plane] = stage.printedPlanes();
    expect(plane.position.x).toBeCloseTo((10 + 40) / 1000, 6);
    expect(plane.scale.y).toBeCloseTo(0.08, 6);
  });

  it("draws a new target's ghost, but only the handles of a target that moves itself", () => {
    const { stage } = newStage();
    stage.setLayout([portrait], page, null, book);
    stage.setGhost({ ...portrait, id: "ghost" });
    const drawn = stage.ghostParts();
    expect((drawn.image as unknown as { material: { visible: boolean } }).material.visible).toBe(true);
    stage.setGhost({ ...portrait, id: "ghost" }, { handlesOnly: true });
    const handles = stage.ghostParts();
    expect((handles.image as unknown as { material: { visible: boolean } }).material.visible).toBe(false);
    expect(handles.corner).not.toBeNull();
    stage.setGhost(null);
    expect(stage.ghostParts()).toEqual({ image: null, corner: null });
  });
});

describe("mock stage: the desk's two tops' look (#107, #226)", () => {
  type Look = { map: { name: string } | null; color: Color };
  type Looks = { topMaterial: Look; edgeMaterial: Look; linoleumMaterial: Look; oakEdgeMaterial: Look; oakMaterial: Look };
  const deskStage = async () => {
    const { Texture } = await import("three");
    const { stage, requested } = newStage();
    (stage as unknown as { loader: unknown }).loader = { load: (url: string) => (requested.push(url), new Texture()) } as never;
    return { stage, requested, looks: stage as unknown as Looks };
  };

  it("shows the default top's look on the first call, plywood faces and plies on the edges", async () => {
    const { stage, requested, looks } = await deskStage();
    stage.setTop("plywood");
    expect(requested).toEqual(["/textures/plywood_diff_1k.jpg", "/textures/plywood_rough_1k.jpg"]);
    expect(looks.topMaterial.map).not.toBeNull();
    expect(looks.edgeMaterial.map?.name).toBe("plywood-edge");
    expect(looks.linoleumMaterial.map).toBeNull();
  });

  it("gives the linoleum top linoleum, the plies in oak on its edges and oak underneath, drawn in code – no file", async () => {
    const { stage, requested, looks } = await deskStage();
    stage.setTop("linoleum");
    expect(requested).toEqual([]);
    expect(looks.linoleumMaterial.map?.name).toBe("linoleum");
    expect(looks.oakMaterial.map?.name).toBe("oak");
    // 13 plies per 18 mm board like the plywood top's edge, tinted to oak (warmer than the birch's grey tint)
    expect(looks.oakEdgeMaterial.map?.name).toBe("plywood-edge");
    const { r, b } = looks.oakEdgeMaterial.color;
    expect(r).toBeGreaterThan(b + 0.2);
    expect(looks.topMaterial.map).toBeNull();
    expect(looks.edgeMaterial.map).toBeNull();
  });

  it("draws each texture once: both tops' edges share the plies, the oak stays the oak", async () => {
    const { stage, looks } = await deskStage();
    stage.setTop("linoleum");
    const oak = looks.oakMaterial.map;
    const plies = looks.oakEdgeMaterial.map;
    stage.setTop("plywood");
    expect(looks.edgeMaterial.map).toBe(plies);
    expect(looks.oakMaterial.map).toBe(oak);
    stage.setTop("linoleum");
    expect(looks.oakMaterial.map).toBe(oak);
    expect(looks.oakEdgeMaterial.map).toBe(plies);
  });
});

describe("mock stage: switching the top switches only the top (#226)", () => {
  // The real model (`static/models/desk-eiermann.glb`), served to the GLTF loader instead of a request
  const loadedStage = async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const glb = readFileSync(resolve(process.cwd(), "static/models/desk-eiermann.glb"));
    const fetched: string[] = [];
    vi.stubGlobal("fetch", vi.fn((request: Request | string) => {
      fetched.push(typeof request === "string" ? request : request.url);
      return Promise.resolve(new Response(new Uint8Array(glb), { status: 200 }));
    }));
    const stage = new MockStage(new Scene(), path => `http://localhost/${path}`);
    (stage as unknown as { loader: unknown }).loader = { load: () => new Texture() } as never;
    const table = (stage as unknown as { table: Group }).table;
    await vi.waitFor(() => expect(table.children).toHaveLength(1));
    return { stage, table, fetched };
  };
  const shown = (table: Group, name: string) => table.getObjectByName(name)!.visible;
  const surface = (table: Group, name: string) => {
    table.updateMatrixWorld(true);
    return new Box3().setFromObject(table.getObjectByName(name)!).max.z;
  };

  it("loads one model – the frame and both tops – and shows the frame with the plywood top", async () => {
    const { table, fetched } = await loadedStage();
    expect(fetched).toEqual(["http://localhost/models/desk-eiermann.glb"]);
    expect(shown(table, "Frame")).toBe(true);
    expect(shown(table, "TopEiermann")).toBe(true);
    expect(shown(table, "TopLinoleum")).toBe(false);
  });

  it("hides one top and shows the other; the frame, the size and the height stay", async () => {
    const { stage, table, fetched } = await loadedStage();
    const position = table.position.clone();
    const size = (name: string) => new Box3().setFromObject(table.getObjectByName(name)!).getSize(new Vector3());
    table.updateMatrixWorld(true);
    expect(size("TopLinoleum").x).toBeCloseTo(size("TopEiermann").x, 6);
    expect(size("TopLinoleum").y).toBeCloseTo(size("TopEiermann").y, 6);
    expect(surface(table, "TopLinoleum")).toBeCloseTo(surface(table, "TopEiermann"), 6);
    stage.setTop("linoleum");
    expect(shown(table, "TopLinoleum")).toBe(true);
    expect(shown(table, "TopEiermann")).toBe(false);
    expect(shown(table, "Frame")).toBe(true);
    stage.setTop("plywood");
    expect(shown(table, "TopEiermann")).toBe(true);
    expect(shown(table, "TopLinoleum")).toBe(false);
    expect(table.position.equals(position)).toBe(true);
    // no second request for a switch
    expect(fetched).toHaveLength(1);
  });

  it("shows the chosen top when the model arrives after the choice", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const glb = readFileSync(resolve(process.cwd(), "static/models/desk-eiermann.glb"));
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(new Uint8Array(glb), { status: 200 }))));
    const stage = new MockStage(new Scene(), path => `http://localhost/${path}`);
    (stage as unknown as { loader: unknown }).loader = { load: () => new Texture() } as never;
    stage.setTop("linoleum");
    const table = (stage as unknown as { table: Group }).table;
    await vi.waitFor(() => expect(table.children).toHaveLength(1));
    expect(shown(table, "TopLinoleum")).toBe(true);
    expect(shown(table, "TopEiermann")).toBe(false);
    // the model's linoleum top wears the stage's own materials
    const own = stage as unknown as { linoleumMaterial: MeshStandardMaterial; oakEdgeMaterial: MeshStandardMaterial; oakMaterial: MeshStandardMaterial };
    const used = new Set<MeshStandardMaterial>();
    table.getObjectByName("TopLinoleum")!.traverse(o => { if ((o as Mesh).isMesh) used.add((o as Mesh).material as MeshStandardMaterial); });
    expect(used).toEqual(new Set([own.linoleumMaterial, own.oakEdgeMaterial, own.oakMaterial]));
  });
});

describe("mock stage: the environment replaces the HDRI (#185)", () => {
  it("takes the HDRI's light away while the world is drawn and keeps it only behind the world's window, and gives both back after", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const scene = new Scene();
    const sun = new DirectionalLight(0xffffff, 0.6);
    scene.add(sun);
    const stage = new MockStage(scene, path => `/${path}`);
    const texture = new Texture();
    (stage as unknown as { hdris: Map<string, Texture> }).hdris.set("wooden_studio_17", texture);
    const sky = () => scene.getObjectByName("mock-sky") as Mesh<SphereGeometry, MeshBasicMaterial> | undefined;
    stage.setHdri("wooden_studio_17");
    expect(scene.environment).toBe(texture);
    expect(sky()?.visible).toBe(true);
    expect(sky()?.material.blending).toBe(NormalBlending);
    expect(sun.intensity).toBeCloseTo(0.6 * 0.35);

    stage.setWorld(true);
    expect(scene.environment).toBeNull();
    expect(sun.intensity).toBeCloseTo(0.6);
    // the sphere stays as the camera window's stand-in, added only where the world left the frame uncovered
    expect(sky()?.visible).toBe(true);
    expect(sky()?.material.blending).toBe(CustomBlending);
    expect(sky()?.material.blendSrc).toBe(OneMinusDstAlphaFactor);
    expect(sky()?.material.blendDst).toBe(OneFactor);
    // the HDRI chosen meanwhile stays out of the light
    stage.setHdri("wooden_studio_17");
    expect(scene.environment).toBeNull();
    // other shadings: no window stand-in (as no HDRI sky there without a world)
    stage.setShading("solid");
    expect(sky()?.visible).toBe(false);
    stage.setShading("rendered");

    stage.setWorld(false);
    expect(scene.environment).toBe(texture);
    expect(sky()?.visible).toBe(true);
    expect(sky()?.material.blending).toBe(NormalBlending);
    expect(sun.intensity).toBeCloseTo(0.6 * 0.35);
  });
});
