import { describe, expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute, Group, LineSegments, Mesh, PlaneGeometry, Points, Raycaster, Vector3 } from "three";
import { outline } from "../shading";

describe("outlines (#192)", () => {
  it("outlines a particle cloud by the box around its points", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([-1, -1, -1, 1, 2, 3], 3));
    const points = new Points(geometry);
    const lines = outline(points, 0xffffff);
    const [box] = points.children as LineSegments[];
    expect(box).toBeInstanceOf(LineSegments);
    expect(box.geometry.getAttribute("position").count).toBe(24); // the 12 edges of a box
    box.geometry.computeBoundingBox();
    expect(box.geometry.boundingBox!.max.toArray()).toEqual([1, 2, 3]);
    lines.remove();
    expect(points.children).toHaveLength(0);
  });

  it("is never hit by a pick, however near the ray passes", () => {
    const group = new Group();
    const plane = new Mesh(new PlaneGeometry(1, 1));
    group.add(plane);
    outline(group, 0xffa028);
    group.updateMatrixWorld(true);
    // A ray beside the plane, within a line's default threshold of its edges
    const raycaster = new Raycaster(new Vector3(0.9, 0, 5), new Vector3(0, 0, -1));
    expect(raycaster.intersectObject(group, true)).toEqual([]);
  });
});
