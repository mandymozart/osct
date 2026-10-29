import { EdgesGeometry, LineBasicMaterial, LineSegments, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D } from "three";

/**
 * The viewport's shading, after Blender's: **wireframe** (every entity as lines), **solid** (one matte grey, the
 * scene's lights), **textured** (the content's materials, the scene's lights, no sky) and **rendered** (the
 * content's materials under the HDRI's sky and light). Applied per entity mesh – the originals are kept and come
 * back – so the stage, the gizmo and the outlines keep their own materials.
 */
export const SHADING_MODES = ["wireframe", "solid", "textured", "rendered"] as const;
export type ShadingMode = (typeof SHADING_MODES)[number];
export const isShadingMode = (value: unknown): value is ShadingMode => SHADING_MODES.includes(value as ShadingMode);

const WIRE = new MeshBasicMaterial({ color: 0xd8d8d8, wireframe: true });
const SOLID = new MeshStandardMaterial({ color: 0xb4b4b4, roughness: 0.85, metalness: 0 });

const originals = new WeakMap<Mesh, Material | Material[]>();

/**
 * The mesh's own material, also while wireframe or solid shows a stand-in: a texture that arrives later (the stage's
 * sheet and print images) goes there, never into the shared stand-in
 */
export const ownMaterial = <M extends Material = Material>(mesh: Mesh): M => (originals.get(mesh) ?? mesh.material) as M;

/** Apply a mode to every mesh below `roots` (the entities); textured and rendered restore the content's materials */
export const applyShading = (roots: readonly Object3D[], mode: ShadingMode): void => {
  roots.forEach(root => root.traverse(object => {
    if (!(object instanceof Mesh) || object.name.startsWith("editor-")) return;
    const mesh = object as Mesh;
    if (mode === "wireframe" || mode === "solid") {
      if (!originals.has(mesh)) originals.set(mesh, mesh.material);
      mesh.material = mode === "wireframe" ? WIRE : SOLID;
    } else {
      const original = originals.get(mesh);
      if (original) {
        mesh.material = original;
        originals.delete(mesh);
      }
    }
  }));
};

/**
 * Outlines in the object's own space (Blender's selection): the edges of every mesh below `object` as lines that
 * show through everything, added as children so they follow the object. `remove` takes them away again.
 */
const OUTLINE_ANGLE = 40;

export interface Outline {
  remove(): void;
}

export const outline = (object: Object3D, color: number, width = 1): Outline => {
  const lines: LineSegments[] = [];
  const material = new LineBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, linewidth: width });
  object.traverse(child => {
    if (!(child instanceof Mesh) || child.name.startsWith("editor-")) return;
    const edges = new LineSegments(new EdgesGeometry(child.geometry, OUTLINE_ANGLE), material);
    edges.name = "editor-outline";
    edges.renderOrder = 999;
    edges.frustumCulled = false;
    child.add(edges);
    lines.push(edges);
  });
  return {
    remove: () => {
      lines.forEach(line => {
        line.removeFromParent();
        line.geometry.dispose();
      });
      material.dispose();
    },
  };
};

/** Blender's colours: the active selection's orange, hover white */
export const SELECTION_COLOR = 0xffa028;
export const HOVER_COLOR = 0xffffff;
