import type { PluginApi } from "osct-plugin-api";

/**
 * The template plugin of the fixture: a material layer that tints a video or image. Copy this folder for your own
 * (`content/plugins/<id>/index.ts`): `register(api)` runs when the plugin loads; a layer is GLSL on every pixel
 * of the node's material after its own shading, in linear RGB – `rgba` is the pixel so far, the parameters arrive
 * as arguments (number → float, boolean → float, color → vec3, choice → int: the index in its options). Used in the
 * content as a component: `components: [{ type: tint, color: "#f3cc94", opacity: 0.35 }]`.
 */
export const register = (api: PluginApi): void => {
  api.registerLayer("tint", {
    description: "Tints the pixels towards one colour.",
    nodeTypes: ["video", "image"],
    params: {
      color: { kind: "color", default: "#f3cc94", description: "The tint (the book's gold by default)." },
      opacity: { kind: "number", default: 0.3, min: 0, max: 1, description: "How much of the tint: 0 = none, 1 = the colour alone." },
      blend: { kind: "choice", options: ["mix", "multiply"], default: "mix", description: "mix blends towards the colour, multiply darkens with it." },
    },
  }, {
    glsl: `
      vec3 tinted = blend == 1 ? rgba.rgb * color : color;
      return vec4(mix(rgba.rgb, tinted, opacity * rgba.a), rgba.a);
    `,
  });
};
