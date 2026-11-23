import type { PluginApi } from "osct-plugin-api";

/**
 * A card look, written as code (#361): how the marginalia card is picked up – a glossary target found in the reader's
 * scan flies its card, and the entry opens once the flight is over. Shows `registerCardLook` (plugin API 4.1): the
 * factory runs once per flight and returns `{ duration, update(t), dispose }`; `t` runs from 0 to 1 over `duration`.
 *
 * Pick it as the experience's `appearance.card` (the editor's appearance panel, section card). Instead of the built-in
 * `cardFlight` (peel, spin, slap) the card **drifts**: it floats up off the page, rocks a little like a leaf, turns
 * towards the reader and glides to the middle of the screen, where it becomes the entry's own picture.
 *
 * What the factory gets (`CardLookContext`): the AR `scene` to add the card to, the `camera`, the page's `anchor` (its
 * matrix is the page's pose – x to the right, y up the page, z out of it, its scale the target's width; it follows the
 * page while it is found), the pictures `front`, `back` and `reveal` (the engine owns and frees them), the picture's
 * `aspect`, `landing(width, fill)` – how far in front of the camera a card that wide fills `fill` of the screen – and
 * `vibrate`.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export const register = (api: PluginApi): void => {
  api.registerCardLook("cardDrift", {
    description: "The card floats up off the page, rocks like a leaf, turns towards the reader and glides to the middle of the screen.",
    params: {
      duration: { kind: "number", default: 1600, min: 300, max: 5000, step: 10, unit: "ms", description: "How long the whole flight takes." },
      rise: { kind: "number", default: 0.5, min: 0, max: 2, step: 0.05, unit: "widths", description: "How high it floats above the page before it turns to the reader." },
      sway: { kind: "number", default: 0.08, min: 0, max: 0.5, step: 0.01, unit: "turns", description: "How far it rocks to the sides while it floats." },
      fill: { kind: "number", default: 0.62, min: 0.2, max: 1, step: 0.01, description: "Share of the screen it fills when it lands." },
    },
  }, ({ three, scene, camera, anchor, front, back, reveal, aspect, landing, vibrate, params }) => {
    // The card: the picture in front, the back behind – on top of everything (no depth test, drawn last)
    const geometry = new three.PlaneGeometry(1, aspect);
    const face = (map: InstanceType<typeof three.Texture>, side: typeof three.FrontSide | typeof three.BackSide) =>
      new three.MeshBasicMaterial({ map, side, transparent: true, depthTest: false, depthWrite: false });
    const frontMaterial = face(front, three.FrontSide);
    const backMaterial = face(back, three.BackSide);
    const card = new three.Group();
    for (const material of [frontMaterial, backMaterial]) {
      const mesh = new three.Mesh(geometry, material);
      mesh.renderOrder = 10_000;
      mesh.frustumCulled = false;
      card.add(mesh);
    }
    scene.add(card);

    // The page's pose: where the card starts, read again every frame (it follows the page while it is found)
    const page = { position: new three.Vector3(), rotation: new three.Quaternion(), scale: new three.Vector3() };
    anchor.matrix.decompose(page.position, page.rotation, page.scale);
    const width = page.scale.x;

    const hover = new three.Vector3();
    const end = new three.Vector3();
    const facing = new three.Quaternion();
    const rock = new three.Quaternion();
    const z = new three.Vector3(0, 0, 1);
    let landed = false;

    return {
      duration: params.duration,
      update: t => {
        anchor.matrix.decompose(page.position, page.rotation, page.scale);
        // Up off the page along its normal, then to the landing straight in front of the camera
        hover.copy(z).applyQuaternion(page.rotation).multiplyScalar(params.rise * width).add(page.position);
        end.set(0, 0, -landing(width, params.fill)).applyMatrix4(camera.matrixWorld);
        facing.setFromRotationMatrix(camera.matrixWorld);
        const float = smooth(t / 0.4);
        const glide = smooth((t - 0.35) / 0.65);
        card.position.lerpVectors(page.position, hover, float).lerp(end, glide);
        // It rocks while it floats, the rocking dies away as it turns to the reader
        rock.setFromAxisAngle(z, Math.sin(t * Math.PI * 3) * params.sway * 2 * Math.PI * (1 - glide));
        card.quaternion.copy(page.rotation).slerp(facing, glide).multiply(rock);
        card.scale.setScalar(width);
        // Landed: the entry's own picture, one short buzz
        if (!landed && t >= 0.97) {
          landed = true;
          if (reveal) {
            frontMaterial.map = reveal;
            frontMaterial.needsUpdate = true;
          }
          vibrate(30);
        }
      },
      dispose: () => {
        card.removeFromParent();
        geometry.dispose();
        frontMaterial.dispose();
        backMaterial.dispose();
      },
    };
  });
};
