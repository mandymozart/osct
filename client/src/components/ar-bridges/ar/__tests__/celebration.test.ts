import { describe, expect, it } from "vitest";
import { BoxGeometry, Color, Group, Matrix4, Mesh, MeshBasicMaterial, ShaderMaterial } from "three";
import { celebrate, CELEBRATION_MS, injectDissolve } from "../celebration";

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

    expect(animation.update(CELEBRATION_MS / 2000)).toBe(true);
    expect(animation.bloom).toBeGreaterThan(0);
    expect(animation.update(CELEBRATION_MS / 1000)).toBe(false);
    expect(animation.bloom).toBe(0);
    expect(a.material).toBe(basic);
    expect(b.material).toBe(custom);
    expect(root.children.some(c => c.type === "Points")).toBe(false);
  });
});
