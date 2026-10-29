import type { PluginApi } from "osct-plugin-api";

/**
 * A component on a group that writes a line of text from the reader's progress – "3 of 9 pages found" – and
 * rewrites it on every first find, on any spread. Shows `api.progress`, a component that builds its own three.js
 * objects with `api.three` (a canvas texture on a plane under the group), and `api.events` for the core events.
 */
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 160;

export const register = (api: PluginApi): void => {
  api.registerComponent("tally", {
    description: "Writes how many pages were found – of this spread or of the whole book – and keeps it current.",
    nodeTypes: ["group"],
    params: {
      of: { kind: "choice", options: ["book", "spread"], default: "book", description: "Count the whole book's pages, or this spread's." },
      label: { kind: "string", default: "pages found", description: "The words after the numbers." },
      color: { kind: "color", default: "#ffffff", description: "The text's colour." },
    },
  }, ({ placed, params, target, three }) => {
    let settings = params;
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const context = canvas.getContext("2d");
    const texture = new three.CanvasTexture(canvas);
    texture.colorSpace = three.SRGBColorSpace;
    const material = new three.MeshBasicMaterial({ map: texture, transparent: true, side: three.DoubleSide });
    const geometry = new three.PlaneGeometry(1, CANVAS_HEIGHT / CANVAS_WIDTH);
    const mesh = new three.Mesh(geometry, material);
    mesh.position.set(0, -0.15, 0.01);
    placed.add(mesh);

    const draw = () => {
      if (!context) return;
      const { unlocked, targets } = api.progress.counts(settings.of === "spread" ? target.spreadId : undefined);
      const label = String(settings.label);
      const text = targets > 0 && unlocked >= targets ? `${targets} ${label} – complete` : `${unlocked} of ${targets} ${label}`;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = `96px Georgia, "Times New Roman", serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = String(settings.color);
      context.fillText(text, canvas.width / 2, canvas.height / 2);
      texture.needsUpdate = true;
    };
    draw();
    const stop = [api.events.on("targetUnlocked", draw), api.events.on("spreadChanged", draw)];

    return {
      onUnlocked: draw,
      tune: next => {
        settings = next;
        draw();
        return true;
      },
      dispose: () => {
        stop.forEach(off => off());
        mesh.removeFromParent();
        geometry.dispose();
        material.dispose();
        texture.dispose();
      },
    };
  });
};
