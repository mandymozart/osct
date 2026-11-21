import type { PluginApi } from "osct-plugin-api";

/**
 * Two components for flat pictures that float in front of their page (a poster's figures lifted off the print):
 *
 * cutout – the picture as a true cut-out among other pictures. An image's plane is a rectangle: its transparent
 * pixels still write depth and hide whatever is drawn after them, and three.js sorts transparent planes by their
 * centres, which flips as the camera moves. With `cutout` the transparent pixels are not drawn at all, and the
 * picture is drawn after every picture that floats lower over the page – whatever the camera does.
 *
 * cutoutShadow – the picture's shadow on the page: its own outline, not its rectangle. `contactShadow` renders what
 * is above the surface with a depth material; a picture's plane is a rectangle to it. This component takes the
 * picture itself: it lays a second plane on the page under the node and draws the picture's alpha there, blurred, in
 * the shadow's colour. The plane is the picture's own plane projected onto the page, so it follows the node as it
 * hovers and is placed. Made for a page that stands (a poster on a wall): the light comes from above, so the shadow
 * falls down the page – the higher the picture floats, the further it falls and the softer it is.
 */

const VERTEX = /* glsl */ `
  uniform float uMargin;
  varying vec2 vUv;
  void main() {
    vUv = (uv - 0.5) * uMargin + 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * uMargin, position.z, 1.0);
  }
`;
// The picture's alpha, averaged over 20 taps on a golden-angle spiral; the mip bias smooths between the taps
const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uRadius;
  uniform float uBias;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  float cover(vec2 uv) {
    vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
    return texture2D(uMap, clamp(uv, 0.0, 1.0), uBias).a * inside.x * inside.y;
  }
  void main() {
    float sum = cover(vUv);
    for (int i = 1; i <= 20; i++) {
      float f = float(i);
      float angle = f * 2.39996323;
      sum += cover(vUv + vec2(cos(angle), sin(angle)) * sqrt(f / 20.0) * uRadius);
    }
    float alpha = sum / 21.0 * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export const register = (api: PluginApi): void => {
  const { three } = api;
  type Object3D = InstanceType<typeof three.Object3D>;
  type Mesh = InstanceType<typeof three.Mesh>;
  type Texture = InstanceType<typeof three.Texture>;
  type Matrix4 = InstanceType<typeof three.Matrix4>;

  // The target's anchor: the node's topmost ancestor below the scene – the page's space (x right, y up the page, z
  // out of it, 1 = the target's width)
  const anchorOf = (placed: Object3D): Object3D | null => {
    let node: Object3D = placed;
    while (node.parent && !(node.parent as { isScene?: boolean }).isScene) node = node.parent;
    return node.parent ? node : null;
  };
  const pageMatrix = (anchor: Object3D, mesh: Object3D, into: Matrix4): Matrix4 => {
    anchor.updateWorldMatrix(true, false);
    mesh.updateWorldMatrix(true, false);
    return into.copy(anchor.matrixWorld).invert().multiply(mesh.matrixWorld);
  };

  api.registerComponent("cutout", {
    description: "The picture as a true cut-out among other pictures: its transparent pixels are not drawn at all (they hide nothing behind them), and it is drawn after every picture that floats lower over the page.",
    nodeTypes: ["image"],
    params: {
      threshold: { kind: "number", default: 0.05, min: 0, max: 1, step: 0.01, label: "threshold", description: "Pixels more transparent than this are left out." },
    },
  }, ({ params, object, placed }) => {
    let p = { ...params };
    let anchor: Object3D | null = null;
    const toPage = new three.Matrix4();
    const each = (visit: (mesh: Mesh) => void) => object.traverse((node: Object3D) => {
      if ((node as Mesh).isMesh) visit(node as Mesh);
    });
    return {
      update: () => {
        anchor ??= anchorOf(placed);
        const threshold = Number(p.threshold);
        each(mesh => {
          // Every frame: a look (reveal, found, lost) may have given the mesh another material meanwhile
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (material.alphaTest !== threshold) {
              material.alphaTest = threshold;
              material.needsUpdate = true;
            }
          }
          // After the shadows (1) and after every picture that floats lower
          if (anchor) mesh.renderOrder = 2 + Math.max(0, pageMatrix(anchor, mesh, toPage).elements[14]);
        });
      },
      tune: next => {
        p = { ...next };
        return true;
      },
      dispose: () => each(mesh => {
        mesh.renderOrder = 0;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          material.alphaTest = 0;
          material.needsUpdate = true;
        }
      }),
    };
  });

  api.registerComponent("cutoutShadow", {
    description: "The shadow of a cut-out picture on the page behind it: the picture's own outline, falling down the page and softer the higher the picture floats.",
    nodeTypes: ["image"],
    params: {
      opacity: { kind: "number", default: 0.5, min: 0, max: 1, step: 0.01, label: "opacity", description: "How dark the shadow is at its darkest." },
      blur: { kind: "number", default: 0.012, min: 0, max: 0.2, step: 0.001, unit: "widths", label: "blur", description: "How soft the shadow is when the picture lies on the page, in target widths." },
      spread: { kind: "number", default: 0.25, min: 0, max: 2, step: 0.01, label: "spread", description: "How much softer it gets with the picture's height above the page (blur added per target width of height)." },
      drop: { kind: "number", default: 0.35, min: -2, max: 2, step: 0.01, label: "drop", description: "How far the shadow falls down the page per target width of height – the light from above. 0 = straight behind the picture." },
      side: { kind: "number", default: 0.1, min: -2, max: 2, step: 0.01, label: "side", description: "How far it falls to the right per target width of height; negative = to the left." },
      color: { kind: "color", default: "#000000", label: "colour", description: "The shadow's colour." },
    },
  }, ({ params, object, placed }) => {
    let p = { ...params };
    const num = (name: string) => Number(p[name]);

    const uniforms = {
      uMap: { value: null as Texture | null },
      uRadius: { value: new three.Vector2() },
      uBias: { value: 0 },
      uMargin: { value: 1 },
      uColor: { value: new three.Color(String(p.color)) },
      uOpacity: { value: 0 },
    };
    const geometry = new three.PlaneGeometry(1, 1);
    // No box: the editor's selection outline (and anything else that measures the node) leaves the shadow out
    geometry.computeBoundingSphere();
    geometry.boundingBox = new three.Box3();
    const material = new three.ShaderMaterial({
      uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, side: three.DoubleSide,
    });
    const shadow = new three.Mesh(geometry, material);
    shadow.name = "cutoutShadow";
    shadow.matrixAutoUpdate = false;
    shadow.frustumCulled = false; // the vertex shader widens the plane by the blur's margin
    shadow.renderOrder = 1; // after the paper and the prints it lies on, before the pictures
    shadow.raycast = () => {}; // taps and the editor's picking go through it
    shadow.visible = false;

    // The picture's plane: the node's own object, or the first mesh in it that carries a picture
    const picture = (): Mesh | null => {
      let found: Mesh | null = null;
      object.traverse((node: Object3D) => {
        const mesh = node as Mesh;
        if (!found && mesh.isMesh && (mesh.material as { map?: Texture | null }).map) found = mesh;
      });
      return found;
    };

    let anchor: Object3D | null = null;
    const shown = (): boolean => {
      for (let node: Object3D | null = placed; node; node = node.parent) if (!node.visible) return false;
      return true;
    };
    // How much of the entity its looks show (docs/plugins.md "Code that comes and goes with its entity")
    const lookShare = (): number => {
      let share = 1;
      for (let node: Object3D | null = placed; node && node !== anchor?.parent; node = node.parent) {
        const value = node.userData.shown;
        if (typeof value === "number") share *= Math.min(1, Math.max(0, value));
      }
      return share;
    };

    const toPage = new three.Matrix4();
    const shear = new three.Matrix4();
    const column = new three.Vector3();
    let presence = 0;

    const place = (delta: number) => {
      anchor ??= anchorOf(placed);
      if (!anchor) return;
      // On the anchor, not in the entity: the looks take every mesh of the entity and would dissolve the shadow with it
      if (shadow.parent !== anchor) anchor.add(shadow);
      const mesh = picture();
      const map = mesh ? (mesh.material as { map?: Texture | null }).map ?? null : null;
      // In the editor only in the Rendered view, as the contact shadow
      const shading = anchor.parent?.userData.shading;
      shadow.visible = !!mesh && !!map && shown() && (shading === undefined || shading === "rendered");
      if (!mesh || !map || !shadow.visible) {
        presence = 0;
        return;
      }
      // The picture's plane in the page's space
      pageMatrix(anchor, mesh, toPage);
      const height = Math.max(0, toPage.elements[14]);
      const width = column.setFromMatrixColumn(toPage, 0).length() || 1;
      const tall = column.setFromMatrixColumn(toPage, 1).length() || 1;

      // Onto the page, half a millimetre above it, along the light: down the page and a little to the side
      const metres = column.setFromMatrixScale(anchor.matrixWorld).x || 1;
      shear.set(
        1, 0, num("side"), 0,
        0, 1, -num("drop"), 0,
        0, 0, 0, 0.0005 / metres,
        0, 0, 0, 1,
      );
      shadow.matrix.multiplyMatrices(shear, toPage);
      shadow.matrixWorldNeedsUpdate = true;

      const radius = num("blur") + num("spread") * height;
      uniforms.uRadius.value.set(radius / width, radius / tall);
      uniforms.uMargin.value = Math.min(3, 1 + (2.2 * radius) / Math.min(width, tall));
      const texels = (radius / width) * ((map.image as { width?: number } | undefined)?.width ?? 1024);
      uniforms.uBias.value = Math.log2(Math.max(1, texels / 4));
      uniforms.uMap.value = map;
      uniforms.uColor.value.set(String(p.color));

      const opaque = (mesh.material as { transparent?: boolean; opacity?: number; visible?: boolean });
      const share = lookShare() * (opaque.visible === false ? 0 : opaque.transparent ? opaque.opacity ?? 1 : 1);
      presence += (share - presence) * Math.min(1, 2 * (1 - Math.exp(-8 * delta)));
      uniforms.uOpacity.value = num("opacity") * presence;
    };

    return {
      update: delta => place(delta),
      tune: next => {
        p = { ...next };
        return true;
      },
      dispose: () => {
        shadow.removeFromParent();
        geometry.dispose();
        material.dispose();
      },
    };
  });
};
