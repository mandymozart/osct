import { afterEach, describe, expect, it, vi } from "vitest";
import { Color, PerspectiveCamera, Scene, Vector2 } from "three";
import { PostChain } from "../post/chain";
import { cameraGrades, cameraGradeShader } from "../post/grade";
import { passContext, passRegistration, registeredPassTypes, registerPass, unregisterPassesOf } from "../post/registry";
import "../post/index";

/** A pass of a plugin's own: three's Pass shape without a renderer */
const fakePass = () => ({ enabled: true, needsSwap: true, clear: false, renderToScreen: false, setSize: vi.fn(), render: vi.fn(), dispose: vi.fn() });

describe("the pass registry", () => {
  afterEach(() => unregisterPassesOf("plugin"));

  it("has the built-in passes registered for the engine", () => {
    expect(registeredPassTypes()).toEqual(expect.arrayContaining(["bloom", "vignette", "grade"]));
    expect(passRegistration("bloom")?.owner).toBe("engine");
  });

  it("a plugin registers its own pass and leaves with it", () => {
    const spec = { description: "", params: { amount: { kind: "number" as const, default: 0.5, min: 0, max: 1, description: "" } } };
    const factory = vi.fn(() => fakePass() as never);
    registerPass("mine", spec, factory, "plugin");
    const registration = passRegistration("mine")!;
    expect(registration.owner).toBe("plugin");
    const context = passContext(registration, { type: "mine" }, new Vector2(300, 200), 2);
    expect(context.params).toEqual({ amount: 0.5 });
    expect(context.size.x).toBe(300);
    expect(context.pixelRatio).toBe(2);
    expect(typeof context.three.Vector2).toBe("function");
    unregisterPassesOf("plugin");
    expect(passRegistration("mine")).toBeUndefined();
    expect(passRegistration("bloom")).toBeDefined();
  });

  it("refuses a type another owner holds, lets the owner replace its own", () => {
    const spec = { description: "", params: {} };
    expect(() => registerPass("bloom", spec, () => fakePass() as never, "plugin")).toThrow(/registered by engine/);
    registerPass("mine", spec, () => fakePass() as never, "plugin");
    expect(() => registerPass("mine", spec, () => fakePass() as never, "plugin")).not.toThrow();
  });

  it("resolves the content's values over the spec's defaults", () => {
    const registration = passRegistration("vignette")!;
    expect(passContext(registration, { type: "vignette", strength: 0.2 }, new Vector2(1, 1), 1).params).toEqual({ strength: 0.2, radius: 0.6, softness: 0.6, color: "#000000" });
  });
});

describe("the chain over a stage with a backdrop", () => {
  const renderer = {
    getSize: () => new Vector2(300, 200),
    getPixelRatio: () => 1,
    capabilities: { maxSamples: 0 },
    getClearColor: (color: Color) => color,
    getClearAlpha: () => 1,
    setClearColor: vi.fn(),
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
  };

  const build = () => {
    const scene = new Scene();
    scene.background = new Color(0x123456);
    const camera = new PerspectiveCamera();
    camera.layers.enable(1);
    const chain = new PostChain(renderer as never, scene, camera);
    const composer = vi.spyOn((chain as unknown as { composer: { render(): void } }).composer, "render").mockImplementation(() => {});
    chain.set([{ type: "grade", exposure: -1.8, contrast: 2 }, { type: "vignette", color: "#00ff00" }]);
    const grade = (chain as unknown as { instances: { pass: { setMask(mask: unknown): void; uniforms?: never; material: { uniforms: Record<string, { value: unknown }> } } }[] }).instances[0].pass;
    return { chain, scene, camera, composer, grade };
  };

  it("draws the AR layer alone into the mask and hands it to the grade, with everything in one image", () => {
    const { chain, scene, camera, composer, grade } = build();
    const seen: unknown[] = [];
    renderer.render.mockImplementation(() => seen.push({ background: scene.background, mask: camera.layers.mask }));
    chain.render({ arLayers: 1 });
    expect(seen).toEqual([{ background: null, mask: 1 }]);
    expect(scene.background).toBeInstanceOf(Color);
    expect(camera.layers.mask).toBe(0b11);
    expect(grade.material.uniforms.uMasked.value).toBe(1);
    expect(grade.material.uniforms.tMask.value).not.toBeNull();
    expect(composer).toHaveBeenCalledOnce();
    chain.dispose();
  });

  it("grades everything again once the image is the AR layer alone", () => {
    const { chain, grade } = build();
    chain.render({ arLayers: 1 });
    chain.render(null);
    expect(grade.material.uniforms.uMasked.value).toBe(0);
    expect(grade.material.uniforms.tMask.value).toBeNull();
    chain.dispose();
  });
});

describe("a live edit of a pass", () => {
  it("changes the uniforms the pass draws with (grade and vignette)", () => {
    const chain = new PostChain({ getSize: () => new Vector2(300, 200), getPixelRatio: () => 1, capabilities: { maxSamples: 0 } } as never, new Scene(), new PerspectiveCamera());
    chain.set([{ type: "grade" }, { type: "vignette" }]);
    chain.set([{ type: "grade", exposure: -1.8, contrast: 2 }, { type: "vignette", color: "#00ff00" }]);
    const [grade, vignette] = (chain as unknown as { instances: { pass: { uniforms: Record<string, { value: unknown }> } }[] }).instances.map(i => i.pass.uniforms);
    expect(grade.uContrast.value).toBe(2);
    expect(grade.uExposure.value).toBeCloseTo(Math.pow(2, -1.8));
    expect((vignette.uColor.value as Color).getHexString()).toBe("00ff00");
    chain.dispose();
  });
});

describe("the grade's reach", () => {
  const grade = (data: Record<string, unknown>) => {
    const registration = passRegistration("grade")!;
    const pass = registration.factory(passContext(registration, { type: "grade", ...data }, new Vector2(1, 1), 1));
    return { pass, uniforms: (pass as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms };
  };
  const mask = { isTexture: true } as never;

  it("ar (the default) takes the AR layer's mask, all grades the whole image", () => {
    const ar = grade({});
    ar.pass.setMask!(mask);
    expect(ar.uniforms.uMasked.value).toBe(1);
    expect(ar.uniforms.tMask.value).toBe(mask);
    const all = grade({ reach: "all" });
    all.pass.setMask!(mask);
    expect(all.uniforms.uMasked.value).toBe(0);
    expect(all.uniforms.tMask.value).toBeNull();
  });

  it("a live edit of the reach switches the mask on and off", () => {
    const { pass, uniforms } = grade({});
    pass.setMask!(mask);
    pass.update!({ reach: "all", exposure: 0, contrast: 1, saturation: 1, tint: "#ffffff" });
    expect(uniforms.uMasked.value).toBe(0);
    pass.update!({ reach: "ar", exposure: 0, contrast: 1, saturation: 1, tint: "#ffffff" });
    expect(uniforms.uMasked.value).toBe(1);
    expect(uniforms.tMask.value).toBe(mask);
  });

  it("the camera picture gets a shader only for the grades that reach it, in order", () => {
    expect(cameraGrades([{ type: "grade" }, { type: "bloom" }, { type: "grade", reach: "ar" }])).toEqual([]);
    expect(cameraGradeShader([])).toBeNull();
    const grades = cameraGrades([{ type: "vignette" }, { type: "grade", reach: "all", exposure: 1, saturation: 0 }, { type: "grade", reach: "all", contrast: 1.5 }]);
    expect(grades).toEqual([
      { reach: "all", exposure: 1, contrast: 1, saturation: 0, tint: "#ffffff" },
      { reach: "all", exposure: 0, contrast: 1.5, saturation: 1, tint: "#ffffff" },
    ]);
    const shader = cameraGradeShader(grades)!;
    expect(shader).toMatch(/varying vec2 texUv;[\s\S]*uniform sampler2D sampler;/);
    expect(shader).toContain("s *= vec3(2.0, 2.0, 2.0);");
    expect(shader).toContain("s, 0.0), 0.0);");
    expect(shader).toContain("* 1.5 + MID_GREY;");
    expect(shader.indexOf("vec3(2.0, 2.0, 2.0)")).toBeLessThan(shader.indexOf("* 1.5 + MID_GREY"));
  });
});
