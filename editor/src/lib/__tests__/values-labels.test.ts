import { afterEach, describe, expect, it } from "vitest";
import type { EntityData } from "@engine/types";
import { installedPlugins, installPlugin, uninstallPlugin } from "@engine/scene/plugins";
import { componentRows, filterRows, helpName, lightRows, passRows, placementRows } from "../values";

/** #173: the Entity panel's rows read as words – the spec's label, else the parameter's name split into words */

afterEach(() => installedPlugins().forEach(uninstallPlugin));

const labels = (rows: { label: string }[]) => rows.map(row => row.label);

describe("the rows' labels", () => {
  it("are words for the built-in component, filter and light", () => {
    expect(labels(componentRows({ type: "animation" }, 0))).toEqual(["clip", "plays on", "stops on", "loop", "speed"]);
    expect(labels(filterRows({ type: "chromaKey" }, 0))).toEqual(["key color", "compare by", "threshold", "soft edge", "spill", "opacity"]);
    expect(labels(lightRows())).toEqual(["kind", "color", "intensity", "distance", "decay", "cone angle", "soft edge"]);
  });

  it("are the placement's keys for its rows, and a pass's names as words", () => {
    const model: EntityData = { type: "model", assets: [] };
    expect(new Set(labels(placementRows(model, false)))).toEqual(new Set(["position", "rotation", "scale"]));
    expect(labels(passRows({ type: "bloom" }, 0))).toEqual(["strength", "radius", "threshold"]);
  });

  it("take a plugin's label, or split its parameter's name into words", () => {
    installPlugin("fx", {
      register: api => api.registerComponent("spin", {
        description: "Turns the node.",
        params: {
          degreesPerSecond: { kind: "number", default: 30, min: -360, max: 360, label: "speed", description: "Speed." },
          wobbleAxis: { kind: "choice", options: ["x", "y"], default: "y", description: "Axis." },
        },
      }, () => ({})),
    });
    const rows = componentRows({ type: "spin" }, 1);
    expect(rows.map(row => [row.id, row.label])).toEqual([["components.1.degreesPerSecond", "speed"], ["components.1.wobbleAxis", "wobble axis"]]);
    // The Info view names a row by its words and, where they differ, by the content's name
    expect(rows.map(helpName)).toEqual(["speed · degreesPerSecond", "wobble axis · wobbleAxis"]);
    expect(helpName(lightRows()[0])).toBe("kind");
  });
});
