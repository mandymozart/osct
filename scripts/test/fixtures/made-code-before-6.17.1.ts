import type { PluginApi } from "osct-plugin-api";

/**
 * Made with "make it code" from the node type "tank" of the plugin tank – the plugin's whole source copied below.
 * From here on it is the experience's own code: change the build, add parameters (rows in the Inspector), Run, Save.
 */
export const register = (api: PluginApi): void => {
  // The copy below registers "tank" as "myTankCode"; what else it registers stays the plugin tank's
  const copy: PluginApi = {
    ...api,
    registerNodeType: (copiedType, _spec, build) => {
      if (copiedType !== "tank") return;
      api.registerNodeType("myTankCode", {
        description: "Tank, made code from a tank node.",
        src: "none",
        params: {
          height: {"kind":"number","default":0.6,"min":0.1,"max":2,"description":"The tank's height, in target widths."},
        },
      }, build);
    },
    registerComponent: () => undefined,
    registerLayer: () => undefined,
    registerPass: () => undefined,
    registerMaterial: () => undefined,
    registerTexture: () => undefined,
  };
  tankPlugin(copy);
};

// ── The plugin tank, copied whole: the build of "tank" below is the build of "myTankCode" ──
/** A tank: a box of water, its height a parameter */
const tankPlugin = (api: PluginApi): void => {
  api.registerNodeType("tank", {
    description: "A box of water.",
    params: { height: { kind: "number", default: 0.4, min: 0.1, max: 2, description: "The tank's height, in target widths." } },
  }, ({ three, params }) => {
    const box = new three.Mesh(new three.BoxGeometry(1, Number(params.height), 0.5), new three.MeshStandardMaterial({ color: "#7bdff2", transparent: true, opacity: 0.5 }));
    return { object: box };
  });
};
