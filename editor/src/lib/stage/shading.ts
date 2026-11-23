import { AlwaysDepth, Box3, BoxGeometry, type BufferGeometry, Color, DoubleSide, EdgesGeometry, LessDepth, LineBasicMaterial, LineSegments, type Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, Points, ShaderMaterial, SkinnedMesh, Vector2, Vector3, type WebGLRenderer } from "three";
import type { ShadingMode } from "./preview";

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
 * Outlines in the object's own space (Blender's selection), added as children so they follow the object; `remove`
 * takes them away again. A mesh gets its **silhouette** (#362): a mask stamps the mesh's screen footprint into the
 * depth buffer, then the mesh drawn eight times, shifted a few pixels around it, colours only what lies outside that
 * footprint – a line of constant width around the whole shape, however many faces it has, showing through everything
 * (the crease edges a scanned model has everywhere made a tangle). `grid` adds the mesh's triangles, faint, on its
 * visible surface (the selection). A particle cloud has no faces: the box around its points stands in.
 */
export interface Outline {
  remove(): void;
}

export interface OutlineOptions {
  /** The silhouette's width in CSS pixels */
  width?: number;
  opacity?: number;
  /** The mesh's triangles on its visible surface (the selection) */
  grid?: boolean;
}

/** A particle cloud has no faces to outline: the box around its points stands in */
const boundsEdges = (geometry: BufferGeometry): EdgesGeometry => {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new Box3();
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const cube = new BoxGeometry(size.x, size.y, size.z).translate(centre.x, centre.y, centre.z);
  const edges = new EdgesGeometry(cube);
  cube.dispose();
  return edges;
};

/**
 * Several outlines at once (the selection, the hover, a target): each takes a slot – its own draw order and depths just
 * behind the near plane, a later slot drawn later and nearer. A ring fails on its own mask (it lies behind it) but
 * passes every earlier slot's mask, so the selection's line is still seen over a hovered model in front of it.
 */
const SLOTS = 8;
let nextSlot = 0;
const STEP = 2e-5;
const maskDepth = (slot: number): number => -1 + 1e-3 - 2 * STEP * slot;
const ringDepth = (slot: number): number => maskDepth(slot) + STEP;
/** After everything else: the grids first (they need the scene's depth), then each slot's mask and ring */
const GRID_ORDER = 899;
const maskOrder = (slot: number): number => 900 + 2 * slot;
const ringOrder = (slot: number): number => 901 + 2 * slot;
/** The eight directions the copies are shifted in */
const RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]] as const;
/** The grid's strength: the mesh's structure readable, the model's picture still seen through it */
const GRID_OPACITY = 0.22;

const SHIFTED_VERTEX = /* glsl */ `
  uniform vec2 uShift;
  uniform float uDepth;
  #include <common>
  #include <skinning_pars_vertex>
  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    clip.xy += uShift * clip.w;
    clip.z = uDepth * clip.w;
    gl_Position = clip;
  }
`;
const FLAT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() { gl_FragColor = vec4(uColor, uOpacity); }
`;
/** The grid pulled a hair towards the camera, so the surface it lies on never hides it */
const GRID_VERTEX = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    clip.z -= 2e-4 * clip.w;
    gl_Position = clip;
  }
`;

const bufferSize = new Vector2();

/** One ring copy's shift, in clip units of what is being drawn into (the screen or a pass's buffer) */
const shiftFor = (renderer: WebGLRenderer, direction: readonly number[], width: number, out: Vector2): void => {
  const target = renderer.getRenderTarget();
  if (target) bufferSize.set(target.width, target.height);
  else renderer.getDrawingBufferSize(bufferSize);
  const pixels = width * renderer.getPixelRatio();
  out.set((direction[0] * pixels * 2) / Math.max(1, bufferSize.x), (direction[1] * pixels * 2) / Math.max(1, bufferSize.y));
};

/** A copy of `source`'s geometry in an outline material (bound to its skeleton when it has one) */
const overlay = (source: Mesh, material: ShaderMaterial, order: number): Mesh => {
  const skinned = (source as SkinnedMesh).isSkinnedMesh ? (source as SkinnedMesh) : null;
  let mesh: Mesh;
  if (skinned) {
    const copy = new SkinnedMesh(source.geometry, material);
    copy.bind(skinned.skeleton, skinned.bindMatrix);
    mesh = copy;
  } else mesh = new Mesh(source.geometry, material);
  mesh.name = "editor-outline";
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  // Never hit by a pick: the outline would make the outlined object catch clicks around it
  mesh.raycast = () => {};
  return mesh;
};

export const outline = (object: Object3D, color: number, { width = 2, opacity = 0.95, grid = false }: OutlineOptions = {}): Outline => {
  const added: Object3D[] = [];
  const materials: Material[] = [];
  const geometries: BufferGeometry[] = [];
  const colour = new Color(color);
  const slot = nextSlot++ % SLOTS;
  const targets: (Mesh | Points)[] = [];
  object.traverse(child => {
    if ((child instanceof Mesh || child instanceof Points) && !child.name.startsWith("editor-")) targets.push(child);
  });
  const add = (parent: Object3D, child: Object3D) => {
    parent.add(child);
    added.push(child);
  };

  for (const target of targets) {
    if (target instanceof Points) {
      const material = new LineBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity });
      const geometry = boundsEdges(target.geometry);
      const box = new LineSegments(geometry, material);
      box.name = "editor-outline";
      box.renderOrder = ringOrder(slot);
      box.frustumCulled = false;
      box.raycast = () => {};
      materials.push(material);
      geometries.push(geometry);
      add(target, box);
      continue;
    }
    const mask = new ShaderMaterial({
      vertexShader: SHIFTED_VERTEX,
      fragmentShader: FLAT_FRAGMENT,
      uniforms: { uShift: { value: new Vector2() }, uDepth: { value: maskDepth(slot) }, uColor: { value: colour }, uOpacity: { value: 0 } },
      // Depth written over whatever is there (a disabled depth test would write nothing)
      colorWrite: false, depthTest: true, depthFunc: AlwaysDepth, depthWrite: true, transparent: true, side: DoubleSide,
    });
    materials.push(mask);
    add(target, overlay(target, mask, maskOrder(slot)));
    for (const direction of RING) {
      const shift = new Vector2();
      const ring = new ShaderMaterial({
        vertexShader: SHIFTED_VERTEX,
        fragmentShader: FLAT_FRAGMENT,
        uniforms: { uShift: { value: shift }, uDepth: { value: ringDepth(slot) }, uColor: { value: colour }, uOpacity: { value: opacity } },
        // All eight at one depth, written: where they overlap, a pixel is coloured once
        depthTest: true, depthFunc: LessDepth, depthWrite: true, transparent: true, side: DoubleSide,
      });
      materials.push(ring);
      const copy = overlay(target, ring, ringOrder(slot));
      copy.onBeforeRender = renderer => shiftFor(renderer, direction, width, shift);
      add(target, copy);
    }
    if (grid) {
      const lines = new ShaderMaterial({
        vertexShader: GRID_VERTEX,
        fragmentShader: FLAT_FRAGMENT,
        uniforms: { uColor: { value: colour }, uOpacity: { value: GRID_OPACITY } },
        wireframe: true, depthTest: true, depthWrite: false, transparent: true,
      });
      materials.push(lines);
      add(target, overlay(target, lines, GRID_ORDER));
    }
  }

  return {
    remove: () => {
      added.forEach(child => child.removeFromParent());
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    },
  };
};

/** The active selection's orange (Blender's); the hover's neutral grey (what a click would pick), seen on the paper and on an entity alike */
export const SELECTION_COLOR = 0xffa028;
export const HOVER_COLOR = 0x8c8c8c;
