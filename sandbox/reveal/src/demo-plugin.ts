import { installPlugin } from "@engine/scene/plugins";

/**
 * A plugin's look, as a book's plugin would register it (docs/plugins.md "A look"): installed through the engine's
 * plugin API so "As shipped" can play a look that is code – in a built-in look's place.
 */
export const DEMO_LOOK = "softFade";

installPlugin("sandbox", {
  register: api => {
    api.registerAppearance(DEMO_LOOK, {
      description: "Fades in while it grows a little; fades out the same way back.",
      params: { duration: { kind: "number", default: 800, min: 50, max: 10000, step: 10, unit: "ms", description: "How long it takes." } },
    }, ({ object, params, materials }) => {
      const surface = materials();
      const size = object.scale.clone();
      return {
        duration: params.duration as number,
        update: visible => {
          surface.forEach(material => {
            material.transparent = true;
            material.opacity = visible;
          });
          object.scale.copy(size).multiplyScalar(0.8 + 0.2 * visible);
        },
      };
    });
  },
});
