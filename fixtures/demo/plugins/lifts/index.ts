import type { PluginApi } from "osct-plugin-api";

/**
 * Two looks, written as code: the engine's built-in `printLift` (a pale print lifts off the page and takes its colours)
 * and `fade`, as plugins – to copy and change, next to `plugins/reveal` (the dissolve). `registerAppearance` runs the
 * factory once per animation; `update(visible)` gets 0 → 1 when the entity appears (reveal, found) and 1 → 0 when the
 * page is lost (lost). Pick `printLiftCode` or `fadeCode` for a moment in the experience's appearance or on a node's
 * reveal / found / lost component.
 *
 * Both fade the entity in with real transparency on copies of its materials (`materials()` – never the model's own,
 * which every entity of the same file shares); `printLiftCode` also lays a colour over the surface (a line of GLSL added
 * to the copies) and lifts the entity off the page – a transform of its object in the page's space around the middle of
 * its footprint, carried into its parent's space, so it works on any node.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const span = (u: number, from: number, to: number) => (to > from ? clamp01((u - from) / (to - from)) : u >= to ? 1 : 0);
const smoothstep = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export const register = (api: PluginApi): void => {
  const { three } = api;
  type Mesh = InstanceType<typeof three.Mesh>;

  const number = (def: number, min: number, max: number, step: number, label: string, description: string, unit?: string) =>
    ({ kind: "number" as const, default: def, min, max, step, label, description, ...(unit ? { unit } : {}) });
  const durations = (appear: number, disappear: number) => ({
    duration: number(appear, 50, 10000, 10, "appear", "How long it takes to appear.", "ms"),
    outDuration: number(disappear, 50, 10000, 10, "disappear", "How long it takes to disappear: the same animation, rewound.", "ms"),
  });

  api.registerAppearance("fadeCode", {
    description: "Fades in, fades out – the engine's fade look, as code: the opacity of copies of the entity's materials.",
    params: { ...durations(600, 400) },
  }, ({ params, moment, materials }) => {
    const copies = materials();
    return {
      duration: Number(moment === "lost" ? params.outDuration : params.duration),
      update: visible => {
        const opacity = smoothstep(visible);
        copies.forEach(copy => {
          copy.transparent = opacity < 1;
          copy.opacity = opacity;
        });
      },
    };
  });

  api.registerAppearance("printLiftCode", {
    description: "The engine's print-lift look, as code: a pale print on the paper lifts off the page, takes its colours and fades in.",
    params: {
      ...durations(1100, 600),
      heightFrom: number(0, 0, 1, 0.01, "height from", "Height along the page normal at the start, as a share of the real one: 0 = flat on the page."),
      shapeStart: number(0.2, 0, 1, 0.01, "shape start", "Share of the time at which it starts to lift."),
      fade: number(0.15, 0, 1, 0.01, "fade", "Share of the time the opacity takes from nothing to full (0 = opaque)."),
      tint: number(0.85, 0, 1, 0.01, "tint", "How much of the tint colour lies over the surface at the start."),
      tintColor: { kind: "color", default: "#f5e7c8", label: "tint colour", description: "The tint's colour." },
      tintEnd: number(0.7, 0, 1, 0.01, "tint gone at", "Share of the time at which the tint is gone."),
    },
  }, ({ object, anchor, params, moment, materials }) => {
    const num = (name: string) => Number(params[name]);
    object.updateWorldMatrix(true, true);
    anchor.updateWorldMatrix(true, false);
    const anchorInverse = new three.Matrix4().copy(anchor.matrixWorld).invert();

    // The footprint on the page: the middle of the box of the vertices, at its base
    const meshes: Mesh[] = [];
    object.traverse(child => {
      if ((child as Mesh).isMesh) meshes.push(child as Mesh);
    });
    const box = new three.Box3();
    const point = new three.Vector3();
    const toPage = new three.Matrix4();
    for (const mesh of meshes) {
      const position = mesh.geometry.getAttribute("position");
      toPage.multiplyMatrices(anchorInverse, mesh.matrixWorld);
      const step = Math.max(1, Math.floor(position.count / 4000));
      for (let i = 0; i < position.count; i += step) box.expandByPoint(mesh.getVertexPosition(i, point).applyMatrix4(toPage));
    }
    const pivot = box.isEmpty() ? new three.Vector3() : new three.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z);

    // The tint: one uniform and a line of GLSL on every copy of the materials
    const tint = { value: 0 };
    const tintColor = { value: new three.Color(String(params.tintColor)) };
    const copies = materials();
    copies.forEach(copy => {
      copy.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, { uTint: tint, uTintColor: tintColor });
        shader.fragmentShader = `uniform float uTint;\nuniform vec3 uTintColor;\n${shader.fragmentShader}`
          .replace(/\}\s*$/, "  gl_FragColor.rgb = mix(gl_FragColor.rgb, uTintColor, uTint);\n}");
      };
      copy.customProgramCacheKey = () => "printLiftCode";
      copy.needsUpdate = true;
    });

    // The lift: the object's matrix is the shape (in the page's space) carried into the parent's space × its placement
    const shape = new three.Matrix4();
    const placement = new three.Matrix4();
    const toParent = new three.Matrix4();
    const autoUpdate = object.matrixAutoUpdate;
    object.matrixAutoUpdate = false;
    const lift = (k: number) => {
      const height = Math.max(0.004, num("heightFrom") + (1 - num("heightFrom")) * k);
      shape.makeTranslation(pivot.x, pivot.y, pivot.z)
        .multiply(new three.Matrix4().makeScale(1, 1, height))
        .multiply(new three.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
      placement.compose(object.position, object.quaternion, object.scale);
      if (object.parent && object.parent !== anchor) {
        anchor.updateWorldMatrix(true, false);
        object.parent.updateWorldMatrix(true, false);
        toParent.copy(anchor.matrixWorld).invert().multiply(object.parent.matrixWorld);
        object.matrix.copy(toParent).invert().multiply(shape).multiply(toParent).multiply(placement);
      } else {
        object.matrix.multiplyMatrices(shape, placement);
      }
      object.matrixWorldNeedsUpdate = true;
    };

    return {
      duration: Number(moment === "lost" ? params.outDuration : params.duration),
      update: visible => {
        lift(inOut(span(visible, num("shapeStart"), 1)));
        const opacity = num("fade") > 0 ? smoothstep(visible / num("fade")) : 1;
        copies.forEach(copy => {
          copy.transparent = opacity < 1;
          copy.opacity = opacity;
        });
        tint.value = num("tint") * (1 - smoothstep(span(visible, 0, num("tintEnd"))));
      },
      dispose: () => {
        object.matrixAutoUpdate = autoUpdate;
        object.updateMatrix();
        object.matrixWorldNeedsUpdate = true;
      },
    };
  });
};
