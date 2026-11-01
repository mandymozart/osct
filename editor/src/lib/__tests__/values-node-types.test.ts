import { afterEach, describe, expect, it } from "vitest";
import type { EntityData, NodeTypeSpec } from "@engine/types";
import { installedPlugins, installPlugin, uninstallPlugin } from "@engine/scene/plugins";
import { nodeAssetKinds, pickFilter, pickKinds } from "../library-pick";
import { contentTree, getValue, newNode, nodeTypeRows, setValue, valueRows } from "../values";

/** A plugin's node type (#77) in the Inspector: its parameters as rows, its file kinds in the Library picker */

const SPARKLE: NodeTypeSpec = {
  description: "Points.",
  params: {
    count: { kind: "number", default: 50, min: 1, max: 500, description: "How many." },
    color: { kind: "color", default: "#ffffff", description: "Their colour." },
    twinkle: { kind: "boolean", default: true, description: "Twinkle." },
  },
};

const install = () => installPlugin("fx", {
  register: api => {
    api.registerNodeType("sparkle", SPARKLE, ({ three }) => ({ object: new three.Group() }));
    api.registerNodeType("poster", { description: "A picture.", src: "image", params: {} }, ({ three }) => ({ object: new three.Group() }));
    api.registerNodeType("statue", { description: "A model.", src: "glb", params: {} }, ({ three }) => ({ object: new three.Group() }));
  },
});

afterEach(() => installedPlugins().forEach(uninstallPlugin));

describe("the Inspector's rows of a plugin's node type", () => {
  it("come from its spec, after the placement rows, as params.{name}", () => {
    install();
    const node = newNode("sparkle");
    expect(node).toEqual({ type: "sparkle", assets: [] });
    expect(valueRows(node, true).map(r => r.id)).toEqual([
      "position.x", "position.y", "position.z", "rotation.x", "rotation.y", "rotation.z", "scale",
      "params.count", "params.color", "params.twinkle",
    ]);
    expect(nodeTypeRows("sparkle").find(r => r.id === "params.count")).toMatchObject({ kind: "number", min: 1, max: 500, default: 50, strict: true });
    expect(nodeTypeRows("group")).toEqual([]);
  });

  it("read the value set or the default and write into the node's params, next to the placement", () => {
    install();
    const [count, color, twinkle] = nodeTypeRows("sparkle");
    const node: EntityData = { type: "sparkle", assets: [], params: { position: [0, 1, 0], count: 120 } };
    expect(getValue(node, count)).toBe(120);
    expect(getValue(node, color)).toBe("#ffffff");
    expect(getValue(node, twinkle)).toBe("true");
    const next = setValue(setValue(node, color, "#ff0000"), twinkle, "false");
    expect(next.params).toEqual({ position: [0, 1, 0], count: 120, color: "#ff0000", twinkle: false });
    expect(node.params).toEqual({ position: [0, 1, 0], count: 120 });
  });

  it("the content keeps only parameters that differ from the defaults", () => {
    install();
    const node: EntityData = { type: "sparkle", assets: [], params: { count: 50, color: "#ff0000", twinkle: true, position: [0, 0, 0] } };
    expect(contentTree(node)).toEqual({ type: "sparkle", assets: [], params: { color: "#ff0000" } });
  });

  it("the file kinds come from the spec's src: the Library picks among those", () => {
    install();
    expect(nodeAssetKinds("poster")).toEqual(["image"]);
    expect(nodeAssetKinds("statue")).toEqual(["glb", "gltf"]);
    expect(nodeAssetKinds("sparkle")).toBeUndefined();
    expect(nodeAssetKinds("model")).toEqual(["glb", "gltf"]);
    expect(nodeAssetKinds("group")).toBeUndefined();
    expect(pickKinds({ for: "node", nodeType: "poster" })).toEqual(["image"]);
    expect(pickFilter({ for: "node", nodeType: "statue" })).toBe("model");
    expect(pickFilter({ for: "node", nodeType: "sparkle" })).toBe("all");
  });
});
