import type { PluginApi } from "osct-plugin-api";

/**
 * A post-processing pass of the book's own (#216): **scan lines** across the rendered picture, like an old screen. A
 * spread or the book names it in its `passes` like a built-in pass – `- type: scanLines` with its parameters, in its
 * place in the chain – and the editor's post-processing section offers it under *add pass · scanlines* with the rows
 * below. The demo's *The switch* carries it switched off (`enabled: false`): its rows are there to find, the toggle in
 * its head switches it on.
 *
 * A line is a horizontal band of darkness every `spacing` screen points, darkest in its middle and fading to nothing
 * halfway to the next: `v = amount · ((1 + cos 2π y / spacing) / 2)²`, y the pixel's row shifted by the lines' scroll.
 * The lines move down `speed` points a second (0 = they stand still) – the pass counts its scroll from the seconds
 * `render` gets, wrapped at one spacing so the number never grows. The chain's buffer holds the AR layer as
 * premultiplied colour over alpha, nothing of the camera picture: a line scales a pixel's colour by `1 − v`, and with
 * `reach: all` it raises the alpha as much, `a (1 − v) + v` – black laid over what lies below, like the vignette's edges –
 * so the lines cross the camera picture too; with `reach: ar` the alpha stays and the AR layer alone is striped.
 */

const FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uAmount;
  uniform float uSpacing;
  uniform float uOffset;
  uniform float uReachAll;
  varying vec2 vUv;

  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float band = 0.5 + 0.5 * cos(6.28318530718 * (gl_FragCoord.y + uOffset) / uSpacing);
    float v = uAmount * band * band;
    gl_FragColor = uReachAll > 0.5
      ? vec4(c.rgb * (1.0 - v), c.a * (1.0 - v) + v)
      : vec4(c.rgb * (1.0 - v), c.a);
  }
`;

export const register = (api: PluginApi): void => {
  api.registerPass("scanLines", {
    description: "Scan lines across the picture: dark horizontal lines like an old screen, scrolling slowly.",
    params: {
      spacing: { kind: "number", default: 3, min: 2, max: 16, step: 0.5, unit: "px", label: "line spacing", description: "From one line to the next, in screen points." },
      amount: { kind: "number", default: 0.3, min: 0, max: 1, step: 0.05, label: "strength", description: "How dark a line is in its middle (0 = no lines, 1 = black)." },
      speed: { kind: "number", default: 6, min: 0, max: 60, step: 1, unit: "px/s", label: "scroll speed", description: "How many screen points a second the lines move down (0 = they stand still)." },
      reach: {
        kind: "choice", options: ["all", "ar"], default: "all",
        description: "all = the lines cross the whole picture, the camera picture included; ar = the AR layer alone.",
      },
    },
  }, ({ params, shaderPass, pixelRatio }) => {
    const uniforms = {
      uAmount: { value: 0 },
      uSpacing: { value: 1 },
      uOffset: { value: 0 },
      uReachAll: { value: 1 },
    };
    let speed = 0;
    const apply = (next: Record<string, unknown>) => {
      uniforms.uAmount.value = Number(next.amount);
      uniforms.uSpacing.value = Number(next.spacing) * pixelRatio;
      uniforms.uReachAll.value = next.reach === "ar" ? 0 : 1;
      speed = Number(next.speed) * pixelRatio;
    };
    apply(params);
    const pass = shaderPass(FRAGMENT, uniforms);
    // The scroll: the seconds since the last frame, which the chain hands every pass, times the speed in pixels
    const render = pass.render.bind(pass);
    pass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
      uniforms.uOffset.value = (uniforms.uOffset.value + (deltaTime ?? 0) * speed) % uniforms.uSpacing.value;
      render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    };
    return Object.assign(pass, { update: apply });
  });
};
