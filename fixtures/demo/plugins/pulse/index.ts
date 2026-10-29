import type { PluginApi } from "osct-plugin-api";

/**
 * A material layer that breathes: the pixels blend towards a colour and back with time. Shows `time` in a layer's
 * GLSL (seconds since the node was built) and a layer stacked on another (the seal carries tint and pulse).
 */
export const register = (api: PluginApi): void => {
  api.registerLayer("pulse", {
    description: "Breathes: blends the pixels towards a colour and back, over and over.",
    nodeTypes: ["video", "image", "text"],
    params: {
      color: { kind: "color", default: "#ffffff", description: "The colour it breathes towards." },
      amount: { kind: "number", default: 0.5, min: 0, max: 1, description: "How far it goes: 0 = nothing, 1 = the colour alone at the peak." },
      speed: { kind: "number", default: 1, min: 0.1, max: 10, step: 0.1, unit: "Hz", description: "Breaths per second." },
    },
  }, {
    glsl: `
      float wave = 0.5 + 0.5 * sin(time * speed * 6.2831853);
      return vec4(mix(rgba.rgb, color, amount * wave * rgba.a), rgba.a);
    `,
  });
};
