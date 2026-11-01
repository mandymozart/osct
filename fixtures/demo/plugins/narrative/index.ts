import type { PluginApi } from "osct-plugin-api";

/**
 * The book's logic across its pages where a rule without code is not enough – two components that talk through the
 * plugin API's events and variables, next to the `behaviour` rules of the content (the key takes itself on a tap, the
 * door's rules decide when it opens):
 *
 * - `door` on a group whose first child is the door: when it hears the scene event `openDoor` for its target (the door's
 *   behaviour emits it, found with `hasKey`), the door lifts and turns over `seconds`, `doorOpen` is set in the
 *   **stage** scope and `doorOpened` emitted – an animation of the node's transform, which no rule can do.
 * - `lamp` on any node: hidden until `doorOpen` is set – on this stage, now or earlier (`api.vars.on`).
 */
export const register = (api: PluginApi): void => {
  api.registerComponent("door", {
    description: "Opens the door (the first child) when it hears openDoor for its target: lifts and turns it, sets doorOpen on the stage, emits doorOpened.",
    nodeTypes: ["group"],
    params: {
      lift: { kind: "number", default: 0.35, min: 0, max: 2, step: 0.05, description: "How far the door lifts off the page (target widths)." },
      seconds: { kind: "number", default: 1.2, min: 0.1, max: 10, step: 0.1, unit: "s", description: "How long the opening takes." },
    },
  }, ({ children, params, target }) => {
    const [door] = children;
    let lift = Number(params.lift);
    let seconds = Number(params.seconds);
    const rest = door ? { z: door.position.z, rz: door.rotation.z } : null;
    let progress = 0;
    let opening = false;

    const open = () => {
      if (opening) return;
      opening = true;
      api.vars.set("doorOpen", true, "stage");
      api.events.emit("doorOpened", { by: "key" });
    };
    // The behaviour's openDoor carries the target it was emitted for
    const offOpen = api.events.on("openDoor", payload => {
      if ((payload as { targetId?: string } | undefined)?.targetId === target.id) open();
    });

    return {
      update: delta => {
        if (!opening || !door || !rest || progress >= 1) return;
        progress = Math.min(1, progress + delta / seconds);
        const eased = 1 - (1 - progress) * (1 - progress);
        door.position.z = rest.z + lift * eased;
        door.rotation.z = rest.rz + (Math.PI / 2) * eased;
      },
      tune: next => {
        lift = Number(next.lift);
        seconds = Number(next.seconds);
        return true;
      },
      dispose: offOpen,
    };
  });

  api.registerComponent("lamp", {
    description: "Hidden until the door opened (doorOpen on the stage) – then it shows.",
    params: {},
  }, ({ object }) => {
    const lit = () => api.vars.get("doorOpen") === true;
    object.visible = lit();
    const off = api.vars.on("doorOpen", () => { object.visible = lit(); });
    return {
      onFound: () => { object.visible = lit(); },
      dispose: off,
    };
  });
};
