import type { PluginApi } from "osct-plugin-api";

/**
 * hover – the node floats like a hoverboard: it bobs up and down along the page normal around its own origin and
 * drifts a little left / right and up / down the page, with a slight tilt that follows the drift. The motion is
 * centred on the placement: on average the node stays where the content puts it.
 *
 * It moves the node's own object (a model's scene, a video's plane) inside its placement – so a `contactShadow` on the
 * same node stays at the origin while the node floats above it. On a group it moves the group's children.
 * Distances are in target widths, in the page's space, whatever the node's rotation and scale.
 */

export const register = (api: PluginApi): void => {
  const { three } = api;
  type Object3D = InstanceType<typeof three.Object3D>;
  type Vector3 = InstanceType<typeof three.Vector3>;
  type Quaternion = InstanceType<typeof three.Quaternion>;

  api.registerComponent("hover", {
    description: "Floats the node like a hoverboard: bobs up and down around its origin and drifts a little to the sides.",
    params: {
      height: { kind: "number", default: 0.012, min: 0, max: 0.2, step: 0.001, label: "height", description: "How far it bobs above and below its origin along the page normal, in target widths." },
      drift: { kind: "number", default: 0.005, min: 0, max: 0.1, step: 0.001, label: "drift", description: "How far it drifts left / right and up / down the page, in target widths." },
      period: { kind: "number", default: 3.2, min: 0.3, max: 20, step: 0.1, unit: "s", label: "period", description: "Seconds for one bob up and down; the drift runs slower, out of step." },
      tilt: { kind: "number", default: 2, min: 0, max: 20, step: 0.1, unit: "°", label: "tilt", description: "How far it banks into its drift." },
    },
  }, ({ params, object, placed, children }) => {
    let p = { ...params };
    const num = (name: string) => Number(p[name]);
    const seed = Math.random() * 100; // two hovering nodes never move in step

    // What moves: the node's own object, or a group's children – each with the rest it returns to
    interface Mover { object: Object3D; rest: Vector3; restQuaternion: Quaternion; set: Vector3; setQuaternion: Quaternion }
    // The node's own object and every child placement beside it: a group's own object is an empty group, its
    // children hang on the placement next to it – moving the object alone moved nothing that is drawn
    const inside = (child: Object3D, root: Object3D): boolean => {
      for (let node: Object3D | null = child; node; node = node.parent) if (node === root) return true;
      return false;
    };
    const targets = [...(object !== placed ? [object] : []), ...children.filter(child => object === placed || !inside(child, object))];
    const movers: Mover[] = targets.map(target => ({
      object: target,
      rest: target.position.clone(),
      restQuaternion: target.quaternion.clone(),
      set: target.position.clone(),
      setQuaternion: target.quaternion.clone(),
    }));

    let anchor: Object3D | null = null;
    const findAnchor = (): Object3D | null => {
      let node: Object3D = placed;
      while (node.parent && !(node.parent as { isScene?: boolean }).isScene) node = node.parent;
      return node.parent ? node : null;
    };

    const toParent = new three.Matrix4();
    const zero = new three.Vector3();
    const offset = new three.Vector3();
    const axisX = new three.Vector3();
    const axisY = new three.Vector3();
    const tiltQuaternion = new three.Quaternion();
    const tiltY = new three.Quaternion();
    let time = 0;

    const move = (delta: number) => {
      anchor ??= findAnchor();
      if (!anchor) return;
      time += delta;
      const t = time + seed;
      const w = (2 * Math.PI) / Math.max(0.05, num("period"));
      // In the page's space: x right, y up the page, z out of it
      const sideX = Math.sin(t * w * 0.61 + 1.3);
      const sideY = Math.sin(t * w * 0.43 + 2.1);
      const page = new three.Vector3(num("drift") * sideX, num("drift") * sideY, num("height") * Math.sin(t * w));
      const bank = (num("tilt") * Math.PI) / 180;

      anchor.updateWorldMatrix(true, false);
      for (const mover of movers) {
        const parent = mover.object.parent;
        if (!parent) continue;
        // Someone else moved it (the editor's gizmo, a rebuild): that is the new rest
        if (!mover.object.position.equals(mover.set)) mover.rest.copy(mover.object.position);
        if (!mover.object.quaternion.equals(mover.setQuaternion)) mover.restQuaternion.copy(mover.object.quaternion);

        parent.updateWorldMatrix(true, false);
        toParent.copy(parent.matrixWorld).invert().multiply(anchor.matrixWorld); // page → parent
        zero.set(0, 0, 0).applyMatrix4(toParent);
        offset.copy(page).applyMatrix4(toParent).sub(zero);
        mover.object.position.copy(mover.rest).add(offset);

        // Bank into the drift: around the page's y axis with the sideways motion, around its x axis with the other
        axisX.set(1, 0, 0).applyMatrix4(toParent).sub(zero).normalize();
        axisY.set(0, 1, 0).applyMatrix4(toParent).sub(zero).normalize();
        tiltQuaternion.setFromAxisAngle(axisY, bank * Math.cos(t * w * 0.61 + 1.3));
        tiltY.setFromAxisAngle(axisX, -bank * Math.cos(t * w * 0.43 + 2.1));
        mover.object.quaternion.copy(tiltQuaternion).multiply(tiltY).multiply(mover.restQuaternion);

        mover.set.copy(mover.object.position);
        mover.setQuaternion.copy(mover.object.quaternion);
      }
    };

    return {
      update: delta => move(delta),
      tune: next => {
        p = { ...next };
        return true;
      },
      dispose: () => {
        for (const mover of movers) {
          mover.object.position.copy(mover.rest);
          mover.object.quaternion.copy(mover.restQuaternion);
        }
      },
    };
  });
};
