import type { PluginApi } from "osct-plugin-api";

/**
 * A post-processing pass of the book's own (#216, content schema 2.21): **film grain** over the rendered picture. A
 * spread or the book names it in its `passes` like a built-in pass – `- type: filmGrain` with its parameters, in its
 * place in the chain (the demo's *The twins* carries it) – and the editor's post-processing section offers it under
 * *add pass · grain* with the rows below.
 *
 * The chain's buffer holds the AR layer as premultiplied colour over alpha, nothing of the camera picture. Every grain
 * fades its pixel a little towards white or black, like the vignette fades its edges: `rgb (1 − v) + K v`, and with
 * `reach: all` the alpha `a (1 − v) + v` too, so the specks lie on the camera picture as well (the whole picture is
 * grainy); with `reach: ar` the alpha stays and the grain is the AR layer's alone. The grain changes `speed` times a
 * second – the pass counts its time from the seconds `render` gets – and a `pattern` (a Library picture, or a procedural
 * texture of a plugin) replaces the noise: its red channel, tiled at 256 px and moved every frame.
 */

const FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D uPattern;
  uniform float uHasPattern;
  uniform float uAmount;
  uniform float uCell;
  uniform float uSpeed;
  uniform float uTime;
  uniform float uReachAll;
  varying vec2 vUv;

  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    vec2 cell = floor(gl_FragCoord.xy / uCell);
    float frame = uSpeed > 0.0 ? floor(uTime * uSpeed) : 0.0;
    float n;
    if (uHasPattern > 0.5) {
      vec2 offset = vec2(hash(vec2(frame, 1.7)), hash(vec2(frame, 9.3)));
      n = texture2D(uPattern, fract(cell / 256.0 + offset)).r * 2.0 - 1.0;
    } else {
      n = hash(cell + vec2(frame * 61.0, frame * 17.0)) * 2.0 - 1.0;
    }
    float v = abs(n) * uAmount;
    vec3 k = n > 0.0 ? vec3(1.0) : vec3(0.0);
    gl_FragColor = uReachAll > 0.5
      ? vec4(c.rgb * (1.0 - v) + k * v, c.a * (1.0 - v) + v)
      : vec4(c.rgb * (1.0 - v) + k * v * c.a, c.a);
  }
`;

export const register = (api: PluginApi): void => {
  api.registerPass("filmGrain", {
    description: "Film grain over the picture: every pixel a little lighter or darker, changing like film.",
    params: {
      amount: { kind: "number", default: 0.12, min: 0, max: 0.5, step: 0.01, label: "grain", description: "How strong the grain is (0 = none)." },
      size: { kind: "number", default: 1.5, min: 1, max: 6, step: 0.5, unit: "px", description: "How big one grain is, in screen points." },
      speed: { kind: "number", default: 24, min: 0, max: 60, step: 1, unit: "fps", description: "How often a second the grain changes (0 = it stands still)." },
      reach: {
        kind: "choice", options: ["all", "ar"], default: "all",
        description: "all = the whole picture is grainy, the camera picture included; ar = the AR layer alone.",
      },
      pattern: { kind: "texture", default: "", description: "A picture to take the grain from instead of noise (its red channel, tiled) – none = noise." },
    },
  }, ({ params, three, shaderPass, pixelRatio }) => {
    const uniforms = {
      uPattern: { value: null as unknown },
      uHasPattern: { value: 0 },
      uAmount: { value: 0 },
      uCell: { value: 1 },
      uSpeed: { value: 0 },
      uTime: { value: 0 },
      uReachAll: { value: 1 },
    };
    const apply = (next: Record<string, unknown>) => {
      uniforms.uAmount.value = Number(next.amount);
      uniforms.uCell.value = Number(next.size) * pixelRatio;
      uniforms.uSpeed.value = Number(next.speed);
      uniforms.uReachAll.value = next.reach === "ar" ? 0 : 1;
      const pattern = next.pattern instanceof three.Texture ? next.pattern : null;
      uniforms.uPattern.value = pattern;
      uniforms.uHasPattern.value = pattern ? 1 : 0;
    };
    apply(params);
    const pass = shaderPass(FRAGMENT, uniforms);
    // The grain's clock: the seconds since the last frame, which the chain hands every pass
    const render = pass.render.bind(pass);
    pass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
      uniforms.uTime.value += deltaTime ?? 0;
      render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    };
    return Object.assign(pass, { update: apply });
  });
};
