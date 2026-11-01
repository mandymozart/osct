import type { PluginApi } from "osct-plugin-api";

/** A component that turns the node around one of its own axes, every frame – the simplest piece of code on a node */
export const register = (api: PluginApi): void => {
  api.registerComponent("spin", {
    description: "Turns the node around one of its own axes.",
    params: {
      degreesPerSecond: { kind: "number", default: 30, min: -360, max: 360, unit: "°/s", label: "speed", description: "Speed; negative turns the other way." },
      axis: { kind: "choice", options: ["x", "y", "z"], default: "y", description: "The node's own axis it turns around." },
    },
  }, ({ object, params }) => {
    let speed = Number(params.degreesPerSecond);
    let axis = String(params.axis) as "x" | "y" | "z";
    return {
      update: delta => {
        object.rotation[axis] += (speed * Math.PI / 180) * delta;
      },
      tune: next => {
        speed = Number(next.degreesPerSecond);
        axis = String(next.axis) as "x" | "y" | "z";
        return true;
      },
    };
  });
};
