import { describe, expect, it } from "vitest";
import type { EntityData } from "@engine/types";
import { contentTree, getValue, lightRows, newNode, setValue, valueRows } from "../values";

describe("the Entity panel's rows of a light node", () => {
  it("come from LIGHT_PARAMS, after the placement rows", () => {
    const node = newNode("light");
    expect(node).toEqual({ type: "light", assets: [] });
    const rows = valueRows(node, true);
    expect(rows.map(r => r.id)).toEqual([
      "position.x", "position.y", "position.z", "rotation.x", "rotation.y", "rotation.z", "scale",
      "light.kind", "light.color", "light.intensity", "light.distance", "light.decay", "light.angle", "light.penumbra",
    ]);
    expect(lightRows().find(r => r.id === "light.kind")).toMatchObject({ kind: "choice", options: ["point", "spot", "directional"], default: "point" });
    expect(lightRows().find(r => r.id === "light.angle")).toMatchObject({ kind: "number", min: 1, max: 90, unit: "°", strict: true });
    expect(valueRows({ type: "model", assets: [] }, true).some(r => r.id.startsWith("light."))).toBe(false);
  });

  it("read the value set or the default, write into the node's light", () => {
    const kind = lightRows().find(r => r.id === "light.kind")!;
    const intensity = lightRows().find(r => r.id === "light.intensity")!;
    const node: EntityData = { type: "light", assets: [], light: { intensity: 3 } };
    expect(getValue(node, kind)).toBe("point");
    expect(getValue(node, intensity)).toBe(3);
    const spot = setValue(setValue(node, kind, "spot"), intensity, 0.5);
    expect(spot.light).toEqual({ kind: "spot", intensity: 0.5 });
    expect(node.light).toEqual({ intensity: 3 });
  });

  it("the content keeps only values that differ from the defaults", () => {
    const tree: EntityData = {
      type: "group", assets: [],
      children: [{ type: "light", assets: [], light: { kind: "point", color: "#ffffff", intensity: 2.00004, angle: 30 }, params: { position: [0, 0, 0.5] } }],
    };
    expect(contentTree(tree).children![0]).toEqual({ type: "light", assets: [], light: { intensity: 2 } });
    const defaults: EntityData = { type: "light", assets: [], light: { kind: "point" } };
    expect(contentTree(defaults)).toEqual({ type: "light", assets: [] });
  });
});
