import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { NodeHiding } from "../node-hiding";

/** The tree's eye on a node (#311): the stage stops drawing and picking the node and its children, nothing else */
const tree = () => {
  const root = new Group();
  const child = new Group();
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  const sibling = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  child.add(mesh);
  root.add(child, sibling);
  return { root, child, mesh, sibling };
};

describe("NodeHiding", () => {
  it("takes the node and its subtree off the layers, and gives them their own layers back", () => {
    const { root, child, mesh, sibling } = tree();
    mesh.layers.enable(3);
    const own = mesh.layers.mask;
    const hiding = new NodeHiding();
    hiding.apply([child]);
    expect(child.layers.mask).toBe(0);
    expect(mesh.layers.mask).toBe(0);
    expect(sibling.layers.mask).toBe(1);
    expect(root.layers.mask).toBe(1);
    // `visible` stays the engine's
    expect(child.visible && mesh.visible).toBe(true);
    hiding.apply([]);
    expect(child.layers.mask).toBe(1);
    expect(mesh.layers.mask).toBe(own);
    expect(hiding.size).toBe(0);
  });

  it("is not picked while hidden", () => {
    const { root, child } = tree();
    root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    const hits = () => new Set(ray.intersectObject(root, true).map(hit => hit.object)).size;
    expect(hits()).toBe(2);
    const hiding = new NodeHiding();
    hiding.apply([child]);
    expect(hits()).toBe(1);
    hiding.clear();
    expect(hits()).toBe(2);
  });

  it("follows a rebuilt node and what is added under it later (an outline, a model that loads late)", () => {
    const first = tree();
    const hiding = new NodeHiding();
    hiding.apply([first.child]);
    // The entity is built anew (a draft change): the old objects get their layers back, the new ones are hidden
    const second = tree();
    hiding.apply([second.child]);
    expect(first.child.layers.mask).toBe(1);
    expect(second.child.layers.mask).toBe(0);
    const late = new Mesh();
    second.mesh.add(late);
    hiding.apply([second.child]);
    expect(late.layers.mask).toBe(0);
    // Something gave a hidden object layers again: off once more, and that mask comes back at the end
    second.mesh.layers.set(2);
    hiding.apply([second.child]);
    expect(second.mesh.layers.mask).toBe(0);
    hiding.clear();
    expect(second.mesh.layers.mask).toBe(1 << 2);
    expect(late.layers.mask).toBe(1);
  });
});
