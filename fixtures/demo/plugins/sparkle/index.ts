import type { PluginApi } from "osct-plugin-api";

/**
 * A node type of the plugin's own: a sparkle of points around the node's origin that twinkle. Shows
 * `registerNodeType` – the plugin builds the three.js object (`Points`), the engine places it like every node; the
 * spec's parameters are rows in the Entity panel and values in the node's `params`; no file (`src: "none"`).
 */
export const register = (api: PluginApi): void => {
  const { three } = api;
  api.registerNodeType("sparkle", {
    description: "A sparkle of points that twinkle around the node.",
    src: "none",
    params: {
      count: { kind: "number", default: 80, min: 1, max: 500, step: 1, description: "How many points." },
      radius: { kind: "number", default: 0.3, min: 0.01, max: 2, unit: "target widths", description: "How far they spread from the node." },
      color: { kind: "color", default: "#f3cc94", description: "Their colour." },
      size: { kind: "number", default: 0.02, min: 0.001, max: 0.2, step: 0.001, description: "A point's size (target widths)." },
      speed: { kind: "number", default: 1, min: 0, max: 5, step: 0.1, unit: "×", description: "How fast they twinkle." },
    },
  }, ({ params }) => {
    const count = Math.round(Number(params.count));
    const radius = Number(params.radius);
    // Points in a ball (a deterministic spread, so the editor's rebuild keeps them where they were)
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const phi = Math.acos(1 - 2 * t);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = radius * Math.cbrt((i * 7919 % count + 0.5) / count);
      positions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)], i * 3);
    }
    const geometry = new three.BufferGeometry();
    geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
    const material = new three.PointsMaterial({ color: String(params.color), size: Number(params.size), transparent: true, depthWrite: false });
    const points = new three.Points(geometry, material);
    let speed = Number(params.speed);
    let time = 0;
    return {
      object: points,
      update: delta => {
        time += delta * speed;
        material.opacity = 0.55 + 0.45 * Math.sin(time * 4);
        points.rotation.z += delta * speed * 0.2;
      },
      // Colour, size and speed change in place; another count or radius needs new points
      tune: next => {
        if (Number(next.count) !== count || Number(next.radius) !== radius) return false;
        material.color.set(String(next.color));
        material.size = Number(next.size);
        speed = Number(next.speed);
        return true;
      },
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    };
  });
};
