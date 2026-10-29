import type { PluginApi } from "osct-plugin-api";

/**
 * The book's logic across its pages – three components that talk through the plugin API's variables and events:
 *
 * - `key` on the key's node: its first find (`onUnlocked`) sets `hasKey` in the **book** scope, which the reader's
 *   progress persists; a tap emits the scene event `keyRattled`.
 * - `door` on a group of two children (the door, a hint): when the page is found with `hasKey`, the door lifts and
 *   turns over `seconds`, `doorOpen` is set in the **stage** scope and `doorOpened` emitted; without the key the hint
 *   child shows. A key found while the door is in view opens it at once (`api.vars.on`).
 * - `lamp` on any node: hidden until `doorOpen` is set – on this stage, now or earlier.
 */
export const register = (api: PluginApi): void => {
  api.registerComponent("key", {
    description: "Finding this node for the first time gives the reader the key (hasKey in the book scope); a tap rattles it.",
    params: {},
  }, () => ({
    onUnlocked: () => api.vars.set("hasKey", true, "book"),
    onTap: () => api.events.emit("keyRattled", { hasKey: api.vars.get("hasKey") === true }),
  }));

  api.registerComponent("door", {
    description: "Opens when the page is found and the reader has the key; shows the hint child otherwise.",
    nodeTypes: ["group"],
    params: {
      lift: { kind: "number", default: 0.35, min: 0, max: 2, step: 0.05, description: "How far the door lifts off the page (target widths)." },
      seconds: { kind: "number", default: 1.2, min: 0.1, max: 10, step: 0.1, unit: "s", description: "How long the opening takes." },
    },
  }, ({ children, params }) => {
    const [door, hint] = children;
    let lift = Number(params.lift);
    let seconds = Number(params.seconds);
    const rest = door ? { z: door.position.z, rz: door.rotation.z } : null;
    let progress = 0;
    let opening = false;
    let inView = false;

    const hasKey = () => api.vars.get("hasKey") === true;
    const open = () => {
      if (opening) return;
      opening = true;
      api.vars.set("doorOpen", true, "stage");
      api.events.emit("doorOpened", { by: "key" });
    };
    const check = () => {
      if (hint) hint.visible = !hasKey();
      if (hasKey()) open();
    };
    const offKey = api.vars.on("hasKey", () => { if (inView) check(); });

    return {
      onFound: () => { inView = true; check(); },
      onLost: () => { inView = false; },
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
      dispose: offKey,
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
