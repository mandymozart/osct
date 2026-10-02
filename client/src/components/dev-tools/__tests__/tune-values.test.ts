import { describe, expect, it } from "vitest";
import { EntityData } from "@/types";
import {
  addFilter, getValue, hasUniformScale, parseNumber, removeFilter, setValue, tuneRows, tuneYaml, TuneRow, valueProblem,
} from "../tune-values";

const model = (params?: Record<string, unknown>): EntityData => ({
  type: "model", assets: [{ id: "tree", assetType: "glb", src: "/tree.glb" }], params,
});
const video = (filters?: EntityData["filters"]): EntityData => ({
  type: "video", assets: [{ id: "clip", assetType: "video", src: "/clip.mp4" }], filters,
});
const row = (entity: EntityData, id: string, uniform = true): TuneRow => tuneRows(entity, uniform).find(r => r.id === id)!;

describe("tune panel values", () => {
  it("has a row for every placement value (three.js names) and every parameter of each filter", () => {
    const ids = tuneRows(video([{ type: "chromaKey" }]), false).map(r => r.id);
    expect(ids).toEqual([
      "position.x", "position.y", "position.z", "rotation.x", "rotation.y", "rotation.z", "scale.x", "scale.y", "scale.z",
      "filters.0.color", "filters.0.mode", "filters.0.threshold", "filters.0.softness", "filters.0.spill", "filters.0.opacity",
    ]);
    expect(tuneRows(model(), true).filter(r => r.id.startsWith("scale")).map(r => r.id)).toEqual(["scale"]);
  });

  it("opens with the content's values, the type's defaults where none are set", () => {
    const entity = model({ rotation: [90, 180, 0], scale: 0.8 });
    expect(getValue(entity, row(entity, "rotation.y"))).toBe(180);
    expect(getValue(entity, row(entity, "rotation.x"))).toBe(90);
    expect(getValue(entity, row(entity, "position.z"))).toBe(0);
    expect(getValue(entity, row(entity, "scale"))).toBe(0.8);
    expect(row(entity, "scale").default).toBe(0.5);
    expect(hasUniformScale(model({ scale: [1, 2, 1] }))).toBe(false);
  });

  it("filter defaults follow the key mode (black key → luma defaults)", () => {
    const green = video([{ type: "chromaKey" }]);
    const black = video([{ type: "chromaKey", color: "#000000" }]);
    expect(row(green, "filters.0.threshold").default).toBe(0.3);
    expect(row(black, "filters.0.threshold").default).toBe(0.06);
    expect(getValue(black, row(black, "filters.0.threshold"))).toBe(0.06);
  });

  it("sets values without changing the original entity", () => {
    const entity = model({ rotation: [90, 0, 0] });
    const turned = setValue(entity, row(entity, "rotation.y"), 45);
    expect(turned.params).toMatchObject({ rotation: [90, 45, 0], position: [0, 0, 0] });
    expect(entity.params).toEqual({ rotation: [90, 0, 0] });
    expect(setValue(entity, row(entity, "scale"), 2).params?.scale).toEqual([2, 2, 2]);
    const keyed = video([{ type: "chromaKey", threshold: 0.3 }]);
    expect(setValue(keyed, row(keyed, "filters.0.threshold"), 0.34).filters).toEqual([{ type: "chromaKey", threshold: 0.34 }]);
  });

  it("adds and removes filters", () => {
    const keyed = addFilter(video(), "chromaKey");
    expect(keyed.filters).toEqual([{ type: "chromaKey" }]);
    expect(removeFilter(keyed, 0).filters).toEqual([]);
  });

  it("reads typed numbers with a comma or a point and refuses values out of range", () => {
    expect(parseNumber("0,35")).toBe(0.35);
    expect(parseNumber(" -12.5 ")).toBe(-12.5);
    expect(parseNumber("1e2")).toBe(100);
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
    const keyed = video([{ type: "chromaKey" }]);
    expect(valueProblem(row(keyed, "filters.0.threshold"), "1.5")).toBe("0 … 1");
    expect(valueProblem(row(keyed, "filters.0.threshold"), "0,4")).toBeNull();
    expect(valueProblem(row(keyed, "filters.0.color"), "#00FF00")).toBeNull();
    expect(valueProblem(row(keyed, "filters.0.color"), "green")).toBe("expected #rrggbb");
    // Placement: beyond the slider is fine, scale must stay above 0
    const entity = model();
    expect(valueProblem(row(entity, "position.y"), "2.5")).toBeNull();
    expect(valueProblem(row(entity, "rotation.y"), "720")).toBeNull();
    expect(valueProblem(row(entity, "scale"), "0")).toBe("must be > 0");
  });

  it("copies only values that differ from the defaults, under the file they belong in", () => {
    let entity = model();
    entity = setValue(entity, row(entity, "rotation.y"), 180);
    entity = setValue(entity, row(entity, "position.y"), 0.1 + 0.2);
    entity = setValue(entity, row(entity, "scale"), 0.8);
    expect(tuneYaml(entity, { entryId: "ancient-tree" }, true)).toBe([
      "# content/entries/ancient-tree/entry.yaml → target.entity",
      "params:",
      "  position: [0, 0.3, 0]",
      "  rotation: [90, 180, 0]",
      "  scale: 0.8",
    ].join("\n"));

    const keyed = video([{ type: "chromaKey", color: "#000000", mode: "auto", threshold: 0.06, softness: 0.2 }]);
    expect(tuneYaml(keyed, { entryId: "edge", ref: "castle", usedBy: ["edge", "old-castle"] }, true)).toBe([
      "# content/entities/castle/entity.yaml (used by edge, old-castle)",
      "# params: all defaults – no params needed",
      "filters:",
      "  - type: chromaKey",
      '    color: "#000000"',
      "    softness: 0.2",
    ].join("\n"));
  });
});
