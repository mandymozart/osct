import type { PluginApi } from "osct-plugin-api";

/**
 * A component on a group that shows one of its children at a time: a tap on the entity shows the next. The scene
 * shown is the spread variable `scene` (it ends with the spread), every switch emits `sceneChanged`. Shows the
 * context's `children` and the `onTap` hook.
 */
export const register = (api: PluginApi): void => {
  api.registerComponent("scenes", {
    description: "Shows one child at a time; a tap on the entity switches to the next.",
    nodeTypes: ["group"],
    params: {
      start: { kind: "number", default: 0, min: 0, max: 20, step: 1, description: "The child shown first (0 = the first child)." },
    },
  }, ({ children, params }) => {
    const clamp = (value: unknown) => Math.min(children.length - 1, Math.max(0, Math.floor(Number(value)) || 0));
    let index = clamp(params.start);
    const show = () => {
      children.forEach((child, i) => (child.visible = i === index));
      api.vars.set("scene", index, "spread");
    };
    show();
    return {
      onTap: () => {
        if (!children.length) return;
        index = (index + 1) % children.length;
        show();
        api.events.emit("sceneChanged", { index });
      },
      tune: next => {
        index = clamp(next.start);
        show();
        return true;
      },
    };
  });
};
