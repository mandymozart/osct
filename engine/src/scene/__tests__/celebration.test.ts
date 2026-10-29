import { describe, expect, it } from "vitest";
import { BoxGeometry, Color, Group, Matrix4, Mesh, MeshBasicMaterial, ShaderMaterial } from "three";
import { ANIMATIONS, celebrate, CELEBRATION_MS, injectDissolve } from "../celebration";

const uniforms = () => ({
  uFreq: { value: 1 },
  uAmp: { value: 1 },
  uProgress: { value: 1 },
  uEdge: { value: 0.1 },
  uEdgeColor: { value: new Color(1, 1, 1) },
  uGlowWidth: { value: 0.3 },
  uGlowColor: { value: new Color(1, 0.8, 0.6) },
  uGlow: { value: 1 },
});

describe("unlock animation (reverse emissive dissolve)", () => {
  it("injects the dissolve into built-in and custom shaders", () => {
    const shader = {
      vertexShader: "attribute vec3 position;\nvoid main() {\n  gl_Position = vec4(position, 1.0);\n}\n",
      fragmentShader: "void main() {\n  gl_FragColor = vec4(1.0);\n}\n",
      uniforms: {} as Record<string, { value: unknown }>,
    };
    injectDissolve(shader, uniforms(), new Matrix4());
    expect(shader.vertexShader).toContain("vDissolvePosition = (uToEntity * vec4(position, 1.0)).xyz;");
    expect(shader.fragmentShader).toMatch(/if \(dissolveNoise < uProgress\) discard;[\s\S]*\}$/);
    expect(Object.keys(shader.uniforms)).toEqual(expect.arrayContaining(["uProgress", "uFreq", "uAmp", "uEdge", "uToEntity"]));
  });

  it("swaps in dissolving clones of the materials, then restores the originals and removes the sparks", () => {
    const basic = new MeshBasicMaterial();
    const custom = new ShaderMaterial({ uniforms: { src: { value: null } } });
    const root = new Group();
    const a = new Mesh(new BoxGeometry(), basic);
    const b = new Mesh(new BoxGeometry(), custom);
    root.add(a, b);
    const placement = new Group();
    placement.add(root);

    const animation = celebrate(new Group(), placement);
    expect(a.material).not.toBe(basic);
    expect(b.material).not.toBe(custom);
    expect((b.material as ShaderMaterial).uniforms.src).toBe(custom.uniforms.src); // same texture uniform
    expect(root.children.some(c => c.type === "Points")).toBe(true);

    for (let i = 0; i < 20; i++) animation.update(1 / 30); // steps are limited to one 30 fps frame
    expect(animation.bloom).toBeGreaterThan(0);
    let frames = 20;
    while (animation.update(1)) frames++; // a stall (e.g. shader compile) does not skip the animation
    expect(frames).toBeGreaterThanOrEqual(Math.ceil(CELEBRATION_MS / (1000 / 30)) - 1);
    expect(animation.bloom).toBe(0);
    expect(a.material).toBe(basic);
    expect(b.material).toBe(custom);
    expect(root.children.some(c => c.type === "Points")).toBe(false);
  });

  it("reveal (later finds) and outro (target lost): plain dissolve – no sparks, no bloom; the outro runs backwards", () => {
    const entity = () => {
      const root = new Group();
      root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
      const placement = new Group();
      placement.add(root);
      return { placement, root };
    };
    for (const kind of ["reveal", "outro"] as const) {
      const { placement, root } = entity();
      const animation = celebrate(new Group(), placement, kind);
      expect(animation.kind).toBe(kind);
      expect(root.children.some(c => c.type === "Points")).toBe(false);
      animation.update(1 / 30);
      expect(animation.bloom).toBe(0);
      let frames = 1;
      while (animation.update(1 / 30)) frames++;
      expect(frames).toBeGreaterThanOrEqual(Math.floor(ANIMATIONS[kind].ms / (1000 / 30)) - 1);
    }
    expect(ANIMATIONS.outro.reverse).toBe(true);
    expect(ANIMATIONS.unlock.ms).toBeGreaterThan(ANIMATIONS.reveal.ms);
  });
});
