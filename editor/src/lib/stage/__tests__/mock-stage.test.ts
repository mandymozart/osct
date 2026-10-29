import { describe, expect, it, vi } from "vitest";
import { LineSegments, Scene } from "three";
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
    stage.setGrid({ on: true, mm: 10, origin: "top-left" });
    const [lines, zeros] = gridOf(stage);
    // per page 23 vertical (x = 10 … 230) + 32 horizontal lines, two points each; the zero lines are separate
    expect(lines.geometry.getAttribute("position").count).toBe(2 * 2 * (23 + 32));
    expect(zeros.geometry.getAttribute("position").count).toBe(2 * 2 * 2);
    stage.setGrid({ on: false, mm: 10, origin: "top-left" });
    expect(gridOf(stage)).toHaveLength(0);
  });

  it("counts both pages as one grid from the book's centre", () => {
    const { stage } = newStage();
    stage.setLayout([], page, null, book);
    stage.setGrid({ on: true, mm: 10, origin: "centre" });
    const [, zeros] = gridOf(stage);
    expect(zeros.geometry.getAttribute("position").count).toBe(2 * 2);
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
