import { describe, expect, it } from "vitest";
import { DirectionalLight, Group, Light, MathUtils, Object3D, PointLight, SpotLight } from "three";
import { EntityData, resolveLight, Target } from "../../types/index";
import { celebrate } from "../celebration";
import { buildEntity, LIGHT_AIM } from "../entities";

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });
const lightOf = (object: Object3D): Light => {
  let found: Light | null = null;
  object.traverse(o => { if ((o as Light).isLight) found ??= o as Light; });
  return found!;
};

describe("light nodes (content schema 3.0)", () => {
  it("resolves every value to what is set or the default", () => {
    expect(resolveLight()).toEqual({ kind: "point", color: "#ffffff", intensity: 0.25, distance: 0, decay: 2, angle: 30, penumbra: 0.1 });
    expect(resolveLight({ kind: "spot", intensity: 3, angle: 200 })).toMatchObject({ kind: "spot", intensity: 3, angle: 30 });
  });

  it("builds a point light with the node's values, hanging half a target width above the parent by default", () => {
    const built = buildEntity(target({ type: "light", assets: [], light: { color: "#ff8800", intensity: 2.5, distance: 1.5, decay: 1 } }), () => undefined)!;
    expect(built.object.position.toArray()).toEqual([0, 0, 0.5]);
    const light = lightOf(built.object) as PointLight;
    expect(light).toBeInstanceOf(PointLight);
    expect(light.color.getHexString()).toBe("ff8800");
    expect(light.intensity).toBe(2.5);
    expect(light.distance).toBe(1.5);
    expect(light.decay).toBe(1);
    expect(light.castShadow).toBe(false);
  });

  it("a spot and a directional light aim along the node's −z (their target is the node's child)", () => {
    const spot = lightOf(buildEntity(target({ type: "light", assets: [], light: { kind: "spot", angle: 20, penumbra: 0.5 } }), () => undefined)!.object) as SpotLight;
    expect(spot).toBeInstanceOf(SpotLight);
    expect(spot.angle).toBeCloseTo(MathUtils.degToRad(20));
    expect(spot.penumbra).toBe(0.5);
    expect(spot.target.parent).toBe(spot.parent);
    expect(spot.target.position.toArray()).toEqual(LIGHT_AIM);
    const sun = lightOf(buildEntity(target({ type: "light", assets: [], light: { kind: "directional" } }), () => undefined)!.object) as DirectionalLight;
    expect(sun).toBeInstanceOf(DirectionalLight);
    expect(sun.target.parent).toBe(sun.parent);
  });

  it("tunes colour and intensity in place; another kind needs a new node", () => {
    const built = buildEntity(target({ type: "light", assets: [], light: { intensity: 1 } }), () => undefined)!;
    const light = lightOf(built.object);
    expect(built.tune!({ type: "light", assets: [], light: { intensity: 4, color: "#00ff00" } })).toBe(true);
    expect(light.intensity).toBe(4);
    expect(light.color.getHexString()).toBe("00ff00");
    expect(built.tune!({ type: "light", assets: [], light: { kind: "spot" } })).toBe(false);
  });

  it("keeps its children: a light under a model, a model under a light", () => {
    const tree: EntityData = { type: "group", assets: [], children: [{ type: "light", assets: [], children: [{ type: "group", assets: [] }] }] };
    const built = buildEntity(target(tree), () => undefined)!;
    expect(Object.keys(built.nodes!).sort()).toEqual(["", "0", "0.0"]);
  });

  it("intensity and distance are in the node's units: scaled to the world every frame (a target is centimetres wide)", () => {
    const built = buildEntity(target({ type: "light", assets: [], light: { intensity: 2, distance: 1.5 } }), () => undefined)!;
    const anchor = new Group();
    anchor.scale.setScalar(0.1); // a target 10 cm wide, in metres
    anchor.add(built.object);
    const light = lightOf(built.object) as PointLight;
    built.update!(0);
    expect(light.intensity).toBeCloseTo(2 * 0.1 * 0.1); // decay 2
    expect(light.distance).toBeCloseTo(0.15);
    const sun = buildEntity(target({ type: "light", assets: [], light: { kind: "directional", intensity: 2 } }), () => undefined)!;
    anchor.add(sun.object);
    sun.update!(0);
    expect(lightOf(sun.object).intensity).toBe(2);
  });

  it("fades with the reveal and the outro: the intensity follows the animation, the original comes back", () => {
    const built = buildEntity(target({ type: "light", assets: [], light: { intensity: 2 } }), () => undefined)!;
    const anchor = new Group();
    anchor.add(built.object);
    const light = lightOf(built.object);
    const frame = (animation: { update(delta: number): boolean }, delta: number) => {
      const running = animation.update(delta);
      built.update!(delta);
      return running;
    };

    const reveal = celebrate(anchor, built.object, "reveal");
    built.update!(0);
    expect(light.intensity).toBe(0);
    frame(reveal, 0.3);
    expect(light.intensity).toBeGreaterThan(0);
    expect(light.intensity).toBeLessThan(2);
    while (frame(reveal, 0.1));
    expect(light.intensity).toBe(2);

    const outro = celebrate(anchor, built.object, "outro");
    built.update!(0);
    expect(light.intensity).toBe(2);
    frame(outro, 0.35);
    expect(light.intensity).toBeLessThan(2);
    outro.finish();
    built.update!(0);
    expect(light.intensity).toBe(2);
  });
});
