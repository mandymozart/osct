import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTexture, Group, type Mesh, Scene, type ShaderMaterial, type Texture, type WebGLRenderTarget } from "three";
import type { EntityData, NodeTypeSpec, Target } from "../../types/index";
import { buildEntity } from "../entities";
import { installedPlugins, installPlugin, uninstallPlugin } from "../plugins";
import {
  collectFeedbacks, createFeedback, type Feedback, feedbackCount, type FeedbackRenderer, feedbackProblems, setFeedbackRenderer, shadertoyFragment,
  stepFeedbacks, supportedFeedbackType,
} from "../feedback";

/** Plugin API 1.6 (#225): GPU feedback buffers the engine steps once per frame, and the Shadertoy adapter */

const PASS = "void main() { gl_FragColor = texture(iChannel0, vUv) + vec4(0.01); }";

/** What one render of a pass saw: the target written, the uniforms of that moment */
interface Draw { target: WebGLRenderTarget | null; frame: number; time: number; channel0: unknown; material: ShaderMaterial }

/** A renderer that records instead of drawing (no WebGL in the tests) */
const stubRenderer = (extensions: string[] = ["EXT_color_buffer_float", "OES_texture_float_linear"]) => {
  let bound: WebGLRenderTarget | null = null;
  const draws: Draw[] = [];
  const renderer: FeedbackRenderer = {
    extensions: { has: name => extensions.includes(name) },
    setRenderTarget: target => { bound = target as WebGLRenderTarget | null; },
    getRenderTarget: () => bound,
    render: object => {
      const material = (object as Mesh).material as ShaderMaterial;
      const u = material.uniforms;
      draws.push({ target: bound, frame: u.iFrame.value as number, time: u.iTime.value as number, channel0: u.iChannel0?.value, material });
    },
  };
  return { renderer, draws };
};

/** A buffer that steps by itself: owned by nobody, so live while the plugin is installed */
const made: Feedback[] = [];
const feedback = (options: Partial<Parameters<typeof createFeedback>[1]> = {}): Feedback => {
  const buffer = createFeedback("test", { width: 4, height: 2, fragment: PASS, ...options });
  made.push(buffer);
  return buffer;
};

afterEach(() => {
  made.splice(0).forEach(buffer => buffer.dispose());
  installedPlugins().forEach(uninstallPlugin);
  setFeedbackRenderer(null);
  vi.restoreAllMocks();
});

describe("a feedback buffer's stepping", () => {
  it("ping-pongs: each step reads the last output and writes the other target, then the texture is the new frame", () => {
    const { renderer, draws } = stubRenderer();
    const buffer = feedback();
    const first = buffer.texture;
    stepFeedbacks(renderer, 1 / 60);
    expect(draws).toHaveLength(1);
    expect(draws[0].channel0).toBe(first); // iChannel0 = "self": the previous frame
    expect(draws[0].target!.texture).not.toBe(first); // written into the other target
    expect(buffer.texture).toBe(draws[0].target!.texture);
    expect(buffer.uniform.value).toBe(buffer.texture); // the uniform follows the swap
    stepFeedbacks(renderer, 1 / 60);
    expect(draws[1].channel0).toBe(draws[0].target!.texture);
    expect(draws[1].target!.texture).toBe(first);
    expect(buffer.texture).toBe(first);
  });

  it("counts iFrame from 0 and iTime by the deltas, and leaves the renderer's target as it was", () => {
    const { renderer, draws } = stubRenderer();
    const buffer = feedback();
    renderer.setRenderTarget(null);
    stepFeedbacks(renderer, 0.5);
    stepFeedbacks(renderer, 0.25);
    stepFeedbacks(renderer, 0.25);
    expect(draws.map(d => d.frame)).toEqual([0, 1, 2]);
    expect(draws.map(d => d.time)).toEqual([0, 0.5, 0.75]);
    expect(buffer.frame).toBe(3);
    expect(renderer.getRenderTarget()).toBeNull();
    expect((buffer.uniforms.iResolution.value as { x: number; y: number; z: number })).toMatchObject({ x: 4, y: 2, z: 1 });
    buffer.reset();
    stepFeedbacks(renderer, 0.1);
    expect(draws[3]).toMatchObject({ frame: 0, time: 0 });
  });

  it("a pass that does not read itself has one target and a stable texture; another buffer's channel is its current frame", () => {
    const { renderer, draws } = stubRenderer();
    const a = feedback();
    const extra = new DataTexture(new Uint8Array(4), 1, 1);
    const image = feedback({ channels: [a, extra, null], type: "byte" });
    const texture = image.texture;
    stepFeedbacks(renderer, 1 / 60);
    // Creation order: a first, so the image pass reads a's new frame
    expect(draws[1].material).not.toBe(draws[0].material);
    expect(draws[1].channel0).toBe(a.texture);
    expect(draws[1].material.uniforms.iChannel1.value).toBe(extra);
    expect(draws[1].material.uniforms.iChannel2.value).toBeNull();
    expect(draws[1].target!.texture).toBe(texture);
    stepFeedbacks(renderer, 1 / 60);
    expect(image.texture).toBe(texture);
    expect(draws[3].channel0).toBe(a.texture);
  });

  it("declares the uniforms before the fragment; the plugin's own uniforms are kept by reference", () => {
    const { renderer, draws } = stubRenderer();
    const speed = { value: 1 };
    const buffer = feedback({ uniforms: { speed }, channels: ["self", null] });
    stepFeedbacks(renderer, 0.1);
    const shader = draws[0].material.fragmentShader;
    ["uniform float iTime;", "uniform float iTimeDelta;", "uniform int iFrame;", "uniform vec3 iResolution;", "uniform sampler2D iChannel0;", "uniform sampler2D iChannel1;", "varying vec2 vUv;"]
      .forEach(line => expect(shader).toContain(line));
    expect(shader).not.toContain("iChannel2");
    expect(shader.endsWith(PASS)).toBe(true);
    expect(buffer.uniforms.speed).toBe(speed);
    expect(draws[0].material.uniforms.iTimeDelta.value).toBe(0.1);
  });

  it("pauses by hand, and never steps again once disposed", () => {
    const { renderer, draws } = stubRenderer();
    const buffer = feedback();
    buffer.paused = true;
    stepFeedbacks(renderer, 0.1);
    expect(draws).toHaveLength(0);
    buffer.paused = false;
    stepFeedbacks(renderer, 0.1);
    expect(draws).toHaveLength(1);
    const before = feedbackCount();
    buffer.dispose();
    buffer.dispose();
    expect(feedbackCount()).toBe(before - 1);
    stepFeedbacks(renderer, 0.1);
    expect(draws).toHaveLength(1);
  });

  it("an owned buffer steps only while its object and every parent are visible in a scene", () => {
    const { renderer, draws } = stubRenderer();
    const [buffer, owned] = collectFeedbacks(() => feedback());
    const object = new Group();
    owned.own(object);
    stepFeedbacks(renderer, 0.1);
    expect(draws).toHaveLength(0); // not placed in a scene yet
    const anchor = new Group();
    const scene = new Scene();
    anchor.add(object);
    scene.add(anchor);
    stepFeedbacks(renderer, 0.1);
    expect(draws).toHaveLength(1);
    anchor.visible = false; // the target is lost
    stepFeedbacks(renderer, 0.1);
    expect(draws).toHaveLength(1);
    anchor.visible = true;
    object.visible = false; // the node is hidden
    stepFeedbacks(renderer, 0.1);
    expect(draws).toHaveLength(1);
    object.visible = true;
    stepFeedbacks(renderer, 0.1);
    expect(draws).toHaveLength(2);
    expect(buffer.frame).toBe(2); // paused frames do not count
    owned.dispose();
    expect(feedbackCount()).toBe(0);
  });
});

describe("precision", () => {
  it("falls back float → half → byte by what the device renders into", () => {
    const has = (...names: string[]) => (name: string) => names.includes(name);
    expect(supportedFeedbackType("float", has("EXT_color_buffer_float", "OES_texture_float_linear"))).toBe("float");
    expect(supportedFeedbackType("float", has("EXT_color_buffer_float"))).toBe("half"); // no linear filtering of float
    expect(supportedFeedbackType("float", has("EXT_color_buffer_float"), false)).toBe("float");
    expect(supportedFeedbackType("half", has("EXT_color_buffer_half_float"))).toBe("half");
    expect(supportedFeedbackType("half", has())).toBe("byte");
    expect(supportedFeedbackType("float", has())).toBe("byte");
    expect(supportedFeedbackType("byte", has("EXT_color_buffer_float"))).toBe("byte");
  });

  it("a buffer made before the renderer is known falls back at its first step, with one warning and new targets", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { renderer } = stubRenderer([]);
    const buffer = feedback({ type: "half" });
    const before = buffer.texture;
    expect(buffer.type).toBe("half");
    stepFeedbacks(renderer, 0.1);
    stepFeedbacks(renderer, 0.1);
    expect(buffer.type).toBe("byte");
    expect(buffer.texture).not.toBe(before);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0])).toMatch(/half render targets are not supported here – 8 bits per channel/);
  });

  it("with the view's renderer known, a buffer gets its precision when it is made", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setFeedbackRenderer(stubRenderer(["EXT_color_buffer_half_float"]).renderer);
    expect(feedback({ type: "float" }).type).toBe("half");
    expect(feedback().type).toBe("half");
    expect((feedback().texture as Texture & { type: number }).type).toBe(1016); // HalfFloatType
  });
});

describe("feedbackProblems", () => {
  it("names every bad option; createFeedback refuses them", () => {
    expect(feedbackProblems({ width: 4, height: 4, fragment: PASS })).toEqual([]);
    expect(feedbackProblems({ width: 0, height: 4.5, fragment: "", type: "double", filter: "cubic", wrap: "mirror", channels: [1, 2, 3, 4, 5] })).toEqual([
      "width is a whole number of pixels, 1–2048",
      "height is a whole number of pixels, 1–2048",
      "fragment is the GLSL of the pass",
      "type is half, float, byte",
      "filter is linear or nearest",
      "wrap is clamp or repeat",
      "channels is a list of at most 4",
    ]);
    expect(feedbackProblems({ width: 4, height: 4, fragment: "void mainImage(out vec4 c, in vec2 p) {}" })[0]).toMatch(/no void main\(\) – a Shadertoy pass goes through api.shadertoy/);
    expect(() => createFeedback("test", { width: 4096, height: 4, fragment: PASS })).toThrow(/api.feedback: width/);
    expect(feedbackCount()).toBe(0);
  });
});

describe("the Shadertoy adapter", () => {
  const SOURCE = "#define K 0.2\nvoid mainImage(out vec4 c, in vec2 p) {\n  c = texture(iChannel0, p / iResolution.xy) * K;\n}\n";

  it("keeps the pass unchanged and adds a main that calls mainImage with fragCoord", () => {
    const fragment = shadertoyFragment(SOURCE);
    expect(fragment.startsWith(SOURCE.trimEnd())).toBe(true);
    expect(fragment).toMatch(/void main\(\) \{\s+vec4 shadertoyColor = vec4\(0\.0, 0\.0, 0\.0, 1\.0\);\s+mainImage\(shadertoyColor, vUv \* iResolution\.xy\);\s+gl_FragColor = shadertoyColor;\s+\}/);
    expect(feedbackProblems({ width: 8, height: 8, fragment })).toEqual([]);
  });

  it("refuses a source without mainImage, or with a main of its own", () => {
    expect(() => shadertoyFragment("void main() {}")).toThrow(/defines void mainImage/);
    expect(() => shadertoyFragment(`${SOURCE}\nvoid main() {}`)).toThrow(/no main\(\) of its own/);
  });
});

describe("api.feedback and api.shadertoy", () => {
  const PAINTING: NodeTypeSpec = { description: "A painting.", params: {} };
  const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });

  it("a node type's buffers belong to its node: they step while it is in view and go when it is disposed", () => {
    const { renderer, draws } = stubRenderer();
    let made: Feedback | null = null;
    installPlugin("ink", {
      register: api => {
        const fragment = api.shadertoy("void mainImage(out vec4 c, in vec2 p) { c = vec4(1.0); }");
        api.registerNodeType("painting", PAINTING, ({ three }) => {
          made = api.feedback({ width: 8, height: 8, fragment });
          return { object: new three.Group() };
        });
      },
    });
    const entity = buildEntity(target({ type: "painting", assets: [] }), () => undefined)!;
    expect(made).not.toBeNull();
    stepFeedbacks(renderer, 0.1);
    expect(draws).toHaveLength(0); // not on a found page
    const scene = new Scene();
    scene.add(entity.object);
    stepFeedbacks(renderer, 0.1);
    expect(draws).toHaveLength(1);
    entity.dispose?.();
    expect(feedbackCount()).toBe(0);
  });

  it("a buffer made in register belongs to the plugin and goes when it is uninstalled", () => {
    installPlugin("ink", { register: api => { api.feedback({ width: 2, height: 2, fragment: PASS }); } });
    expect(feedbackCount()).toBe(1);
    uninstallPlugin("ink");
    expect(feedbackCount()).toBe(0);
  });

  it("a build that throws leaves no buffer behind", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installPlugin("ink", {
      register: api => api.registerNodeType("painting", PAINTING, () => {
        api.feedback({ width: 8, height: 8, fragment: PASS });
        throw new Error("no");
      }),
    });
    expect(buildEntity(target({ type: "painting", assets: [] }), () => undefined)).toBeNull();
    expect(feedbackCount()).toBe(0);
  });
});
