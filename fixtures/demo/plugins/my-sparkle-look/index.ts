import type { PluginApi } from "osct-plugin-api";

/**
 * Made with "make material code" from the look of a sparkle node ("Sparkle").
 * From here on it is the book's own code: change the build, add parameters (rows in the Entity panel), Run, Save.
 */
export const register = (api: PluginApi): void => {
  const { three } = api;
  api.registerMaterial("mySparkleLook", {
    description: "The look of a sparkle node as a standard material: colour, roughness, metalness, another picture.",
    params: {
      color: {"kind":"color","default":"#ffffff","label":"colour","description":"The base colour (multiplies the picture)."},
      roughness: {"kind":"number","default":0.6,"min":0,"max":1,"step":0.01,"label":"roughness","description":"0 = a mirror, 1 = matte."},
      metalness: {"kind":"number","default":0,"min":0,"max":1,"step":0.01,"label":"metalness","description":"0 = a dielectric, 1 = a metal."},
      picture: {"kind":"texture","default":"","label":"picture","description":"Another picture – empty keeps the node's own."},
    },
  }, ({ params, map }) => new three.MeshStandardMaterial({
    map: (params.picture ?? map) as typeof map,
    color: new three.Color(String(params.color)),
    roughness: Number(params.roughness),
    metalness: Number(params.metalness),
  }));
};
