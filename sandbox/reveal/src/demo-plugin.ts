import { installPlugin } from "@engine/scene/plugins";
import { register as registerLifts } from "../../../fixtures/demo/plugins/lifts/index";
import { register as registerReveal } from "../../../fixtures/demo/plugins/reveal/index";

/**
 * A plugin's look, as a book's plugin would register it (docs/plugins.md "A look"): installed through the engine's
 * plugin API so "As shipped" can play a look that is code – in a built-in look's place.
 */
export const DEMO_LOOK = "softFade";
/** The demo book's `reveal` plugin: the built-in look as code, with the built-in look's parameters */
export const REVEAL_CODE_LOOK = "revealCode";
installPlugin("reveal", { register: registerReveal });
/** The demo book's `lifts` plugin: printLiftCode and fadeCode (their own parameters; the sandbox passes the durations) */
export const LIFT_LOOKS = ["printLiftCode", "fadeCode"] as const;
installPlugin("lifts", { register: registerLifts });

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
