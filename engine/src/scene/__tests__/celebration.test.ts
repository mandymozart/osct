import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Color, Group, Matrix4, Mesh, MeshBasicMaterial, type Object3D, PointLight, ShaderMaterial, Vector3 } from "three";
import { APPEARANCES, type AppearanceData, DEFAULT_APPEARANCE_TYPE, ENTITY_UNLOCK_MS, momentDuration } from "../../types/index";
import { registerAppearance, unregisterAppearancesOf } from "../appearances";
import { celebrate, injectDissolve, lookOf, SHOWN } from "../celebration";

const uniforms = () => ({
  uDissolve: { value: 1 },
  uFreq: { value: 1 },
  uAmp: { value: 1 },
  uProgress: { value: 1 },
  uEdge: { value: 0.1 },
  uEdgeColor: { value: new Color(1, 1, 1) },
  uGlowWidth: { value: 0.3 },
  uGlowColor: { value: new Color(1, 0.8, 0.6) },
  uGlow: { value: 1 },
  uTint: { value: 0 },
  uTintColor: { value: new Color(1, 1, 1) },
  uOpacity: { value: 1 },
});

/** An entity as the scene builds it: the anchor, the placement group on it, the entity's own object with a box */
const entity = (material = new MeshBasicMaterial()) => {
  const anchor = new Group();
  const placement = new Group();
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(), material);
  root.add(mesh);
  placement.add(root);
  anchor.add(placement);
  return { anchor, placement, root, mesh };
};

const FRAME = 1 / 30;
const frames = (ms: number) => Math.round(ms / (1000 * FRAME));
const sparksOn = (object: Object3D) => object.children.some(child => child.type === "Points");
/** The placement group's matrix as scale along x and z and the turn around z, in degrees */
const shapeOf = (placement: Object3D) => {
  const e = placement.matrix.elements;
  return { x: Math.hypot(e[0], e[1]), z: Math.abs(e[10]), turn: (Math.atan2(e[1], e[0]) * 180) / Math.PI };
};
const DEFAULT = lookOf({ type: DEFAULT_APPEARANCE_TYPE })!;

afterEach(() => unregisterAppearancesOf("test"));

describe("appear / disappear animation", () => {
  it("injects the dissolve, the tint and the opacity into built-in and custom shaders", () => {
    const shader = {
      vertexShader: "attribute vec3 position;\nvoid main() {\n  gl_Position = vec4(position, 1.0);\n}\n",
      fragmentShader: "void main() {\n  gl_FragColor = vec4(1.0);\n}\n",
      uniforms: {} as Record<string, { value: unknown }>,
    };
    injectDissolve(shader, uniforms(), new Matrix4());
    expect(shader.vertexShader).toContain("vDissolvePosition = (uToEntity * vec4(position, 1.0)).xyz;");
    expect(shader.fragmentShader).toMatch(/if \(dissolveNoise < uProgress\) discard;[\s\S]*gl_FragColor\.a \*= uOpacity;\s*\}$/);
    expect(Object.keys(shader.uniforms)).toEqual(expect.arrayContaining(["uDissolve", "uProgress", "uFreq", "uAmp", "uEdge", "uTint", "uOpacity", "uToEntity"]));
  });

  it("swaps in copies of the materials, then restores the originals and removes the sparks", () => {
    const basic = new MeshBasicMaterial();
    const custom = new ShaderMaterial({ uniforms: { src: { value: null } } });
    const { anchor, placement, root, mesh: a } = entity(basic);
    const b = new Mesh(new BoxGeometry(), custom);
    root.add(b);

    const animation = celebrate(anchor, placement);
    expect(animation.kind).toBe("reveal");
    expect(a.material).not.toBe(basic);
    expect(b.material).not.toBe(custom);
    expect((b.material as ShaderMaterial).uniforms.src).toBe(custom.uniforms.src); // same texture uniform
    expect(sparksOn(anchor)).toBe(true); // in the anchor's space: they fly unshaped

    let count = 0;
    while (animation.update(1)) count++; // a stall (e.g. shader compile) does not skip the animation
    expect(count).toBeGreaterThanOrEqual(frames(DEFAULT.duration) - 2);
    expect(a.material).toBe(basic);
    expect(b.material).toBe(custom);
    expect(sparksOn(anchor)).toBe(false);
  });

  it("covers the entity's whole node tree: a child node's meshes are animated too", () => {
    const { anchor, placement } = entity();
    const child = new Group(); // a child node's placement group, beside the node's own object
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(new BoxGeometry(), material);
    child.add(mesh);
    placement.add(child);
    const animation = celebrate(anchor, placement, "found");
    expect(mesh.material).not.toBe(material);
    animation.finish();
    expect(mesh.material).toBe(material);
  });

  it("the default look: flat, small and turned at the start, the placement alone at the end", () => {
    const { anchor, placement } = entity();
    placement.position.set(0.2, 0.1, 0);
    placement.scale.setScalar(0.5);
    placement.updateMatrix();
    const placed = placement.matrix.clone();

    const animation = celebrate(anchor, placement, "found");
    const start = shapeOf(placement);
    expect(start.x).toBeLessThan(0.01);
    expect(start.z).toBeLessThan(start.x); // flatter than it is small
    expect(Math.abs(start.turn)).toBeCloseTo(180); // half a turn to go

    for (let i = 0; i < frames(DEFAULT.duration * 0.4); i++) animation.update(FRAME);
    const mid = shapeOf(placement);
    expect(mid.x).toBeGreaterThan(start.x);
    expect(mid.x).toBeLessThan(0.5);
    expect(mid.z).toBeLessThan(mid.x); // still rising

    // A tool moves the entity while it appears: the shape goes on around the placement as it is now
    placement.position.x = 0.4;
    while (animation.update(FRAME));
    expect(placement.matrixAutoUpdate).toBe(true);
    expect(placement.matrix.elements[12]).toBeCloseTo(0.4);
    placement.position.x = 0.2;
    placement.updateMatrix();
    placement.matrix.elements.forEach((value, i) => expect(value).toBeCloseTo(placed.elements[i]));
  });

  it("the shape turns and grows around the centre of the entity's footprint on the anchor", () => {
    const { anchor, placement, mesh } = entity();
    mesh.position.set(1, 0, 0.5); // the unit box stands on the page, one unit to the right
    const animation = celebrate(anchor, placement, "found");
    for (let i = 0; i < 10; i++) animation.update(FRAME);
    placement.updateMatrixWorld(true);
    // The middle of its base stays where it is, whatever the shape
    const base = new Vector3(0, 0, -0.5).applyMatrix4(mesh.matrixWorld);
    expect(base.x).toBeCloseTo(1);
    expect(base.y).toBeCloseTo(0);
    expect(base.z).toBeCloseTo(0);
    animation.finish();
  });

  it("a node below the root animates its own subtree apart: the root's animation skips it, its shape stays around its own footprint (#268)", () => {
    const { anchor, placement } = entity();
    const child = new Group(); // a child node's placement group, carrying its own look
    child.position.set(2, 0, 0);
    child.updateMatrix();
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(new BoxGeometry(), material);
    mesh.position.z = 0.5; // stands on the page
    child.add(mesh);
    placement.add(child);

    const apart = new Set<Object3D>([child]);
    const whole = celebrate(anchor, placement, "found", { type: "fade" }, apart);
    expect(mesh.material).toBe(material); // the root's look does not touch the child's meshes
    const own = celebrate(anchor, child, "found", { type: "inflateDissolve" }, apart);
    expect(mesh.material).not.toBe(material);
    for (let i = 0; i < 10; i++) own.update(FRAME);
    child.updateMatrixWorld(true);
    // The middle of the child's base stays where it is – two units to the right of the root – whatever its shape
    const base = new Vector3(0, 0, -0.5).applyMatrix4(mesh.matrixWorld);
    expect(base.x).toBeCloseTo(2);
    expect(base.z).toBeCloseTo(0);
    own.finish();
    whole.finish();
    expect(mesh.material).toBe(material);
    expect(child.matrixAutoUpdate).toBe(true);
    expect(child.matrix.elements[12]).toBeCloseTo(2);
  });

  it("reveal and found play a look forwards, lost plays it rewound in its own time", () => {
    expect(DEFAULT.duration).toBe(ENTITY_UNLOCK_MS); // the found indicator's label stays as long without a book's look
    const { anchor, placement } = entity();
    const lost = celebrate(anchor, placement, "lost");
    expect(lost.kind).toBe("lost");
    expect(shapeOf(placement).x).toBeCloseTo(1); // starts as the entity is
    let count = 1;
    while (lost.update(FRAME)) count++;
    expect(count).toBeGreaterThanOrEqual(frames(DEFAULT.outDuration) - 1);
    expect(count).toBeLessThan(frames(DEFAULT.duration));
  });

  it("printLift and fade: no dissolve, no sparks; see-through only while the opacity rises", () => {
    for (const type of ["printLift", "fade"] as const) {
      const look = lookOf({ type })!;
      const original = new MeshBasicMaterial();
      const { anchor, placement, mesh } = entity(original);
      const animation = celebrate(anchor, placement, "found", { type });
      expect(sparksOn(anchor)).toBe(false);
      expect(animation.bloom).toBe(0);
      const copy = mesh.material as MeshBasicMaterial;
      expect(copy.transparent).toBe(true); // opacity 0 at the start
      for (let i = 0; i < frames(look.duration * look.fade) + 1; i++) animation.update(FRAME);
      if (type === "printLift") {
        expect(copy.transparent).toBe(false); // opaque again while it still lifts
        expect(shapeOf(placement).z).toBeLessThan(1);
      }
      while (animation.update(FRAME));
      expect(mesh.material).toBe(original);
      expect(original.transparent).toBe(false);
    }
    // The fade keeps the entity's shape
    const { anchor, placement } = entity();
    celebrate(anchor, placement, "found", { type: "fade" });
    expect(placement.matrixAutoUpdate).toBe(true);
  });

  it("a look's values come from the content over the type's defaults; loose values fall back", () => {
    expect(lookOf({ type: "fade", duration: 900 })).toMatchObject({ duration: 900, outDuration: 400, fade: 1, mask: "none" });
    expect(lookOf({ type: "printLift", shapeEase: "elastic", tintColor: "gold", spin: "half", stagger: 0.5 }))
      .toMatchObject({ shapeEase: "inOut", tintColor: "#f5e7c8", spin: 0 });
    expect(lookOf({ type: "printLift", stagger: 0.5 })).not.toHaveProperty("stagger");
    expect(lookOf({ type: "swirl" })).toBeNull();
    // The contract's defaults are the looks' values
    expect(APPEARANCES.inflateDissolve.params.sparks.default).toBe(300);
    expect(momentDuration({ appearance: { found: { type: "fade", duration: 900 } } }, "reveal")).toBe(900);
  });

  it("a look's bloom rises and is gone at the end", () => {
    const { anchor, placement } = entity();
    const animation = celebrate(anchor, placement, "reveal", { type: DEFAULT_APPEARANCE_TYPE, bloom: 0.8 });
    for (let i = 0; i < 20; i++) animation.update(FRAME);
    expect(animation.bloom).toBeGreaterThan(0);
    while (animation.update(FRAME));
    expect(animation.bloom).toBe(0);
  });
});

describe("a plugin's look", () => {
  const SPEC = { description: "Fades.", params: { duration: { kind: "number", default: 300, min: 50, max: 5000, step: 10, description: "ms" } } } as const;
  const softFade: AppearanceData = { type: "softFade", duration: 400 };

  it("plays in a built-in look's place: visible runs 0 → 1, on lost 1 → 0, over its duration", () => {
    const seen: Array<{ moment: string; visible: number }> = [];
    registerAppearance("softFade", SPEC, ({ params, moment }) => ({
      duration: params.duration as number,
      update: visible => seen.push({ moment, visible }),
    }), "test");

    const { anchor, placement, mesh } = entity();
    const original = mesh.material;
    const found = celebrate(anchor, placement, "found", softFade);
    expect(mesh.material).toBe(original); // the engine's own animation does not run
    expect(sparksOn(anchor)).toBe(false);
    expect(seen[0]).toEqual({ moment: "found", visible: 0 });
    let count = 0;
    while (found.update(FRAME)) count++;
    expect(count).toBeGreaterThanOrEqual(frames(400) - 1);
    expect(count).toBeLessThanOrEqual(frames(400));
    expect(seen.at(-1)).toEqual({ moment: "found", visible: 1 });

    seen.length = 0;
    const lost = celebrate(anchor, placement, "lost", softFade);
    expect(seen[0]).toEqual({ moment: "lost", visible: 1 });
    while (lost.update(FRAME));
    expect(seen.at(-1)).toEqual({ moment: "lost", visible: 0 });
  });

  it("tells the entity how much of it is there – userData.shown and its lights' fade, as a built-in look does – and takes it back at the end (#270)", () => {
    registerAppearance("softFade", SPEC, ({ params }) => ({ duration: params.duration as number, update: () => {} }), "test");
    for (const look of [softFade, { type: "fade" }] as const) {
      const { anchor, placement, root } = entity();
      const light = new PointLight();
      root.add(light);
      const reveal = celebrate(anchor, placement, "reveal", look);
      expect(placement.userData[SHOWN]).toBe(0);
      expect(light.userData.fade).toBe(0);
      for (let i = 0; i < 6; i++) reveal.update(FRAME);
      const midway = placement.userData[SHOWN] as number;
      expect(midway).toBeGreaterThan(0);
      expect(midway).toBeLessThan(1);
      expect(light.userData.fade).toBe(midway);
      while (reveal.update(FRAME));
      expect(SHOWN in placement.userData).toBe(false); // no value: all of it
      expect(light.userData.fade).toBe(1);

      const lost = celebrate(anchor, placement, "lost", look);
      expect(placement.userData[SHOWN]).toBe(1);
      for (let i = 0; i < 6; i++) lost.update(FRAME);
      expect(placement.userData[SHOWN]).toBeLessThan(1);
      lost.finish();
      expect(SHOWN in placement.userData).toBe(false);
    }
  });

  it("gets copies of the materials and the placement back when it ends, and is disposed", () => {
    const dispose = vi.fn();
    registerAppearance("softFade", SPEC, ({ object, materials }) => {
      const surface = materials();
      return {
        duration: 100,
        update: visible => {
          object.scale.setScalar(visible + 0.1);
          surface.forEach(material => {
            material.transparent = true;
            material.opacity = visible;
          });
        },
        dispose,
      };
    }, "test");
    const original = new MeshBasicMaterial();
    const { anchor, placement, mesh } = entity(original);
    placement.scale.setScalar(0.5);
    const animation = celebrate(anchor, placement, "reveal", softFade);
    expect(mesh.material).not.toBe(original);
    expect((mesh.material as MeshBasicMaterial).opacity).toBe(0);
    expect(placement.scale.x).toBeCloseTo(0.1);
    while (animation.update(FRAME));
    expect(mesh.material).toBe(original);
    expect(original.opacity).toBe(1);
    expect(placement.scale.x).toBe(0.5);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("a look that fails does not break the scene: the default look plays, or the animation ends", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerAppearance("softFade", SPEC, () => {
      throw new Error("no");
    }, "test");
    const first = entity();
    const fallback = celebrate(first.anchor, first.placement, "found", softFade);
    expect(sparksOn(first.anchor)).toBe(true); // the default look
    fallback.finish();

    let calls = 0;
    registerAppearance("softFade", SPEC, () => ({
      duration: 500,
      update: () => {
        if (++calls > 2) throw new Error("later");
      },
    }), "test");
    const second = entity();
    const failing = celebrate(second.anchor, second.placement, "found", softFade);
    expect(failing.update(FRAME)).toBe(true);
    expect(failing.update(FRAME)).toBe(false); // ended, the entity as it is
    expect(failing.update(FRAME)).toBe(false);

    // A type nobody registered: the default look
    const third = entity();
    celebrate(third.anchor, third.placement, "found", { type: "nobody" }).finish();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
