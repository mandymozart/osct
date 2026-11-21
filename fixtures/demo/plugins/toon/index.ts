// Toon look for models (SCUTOONS test, Cat Pope poster): the model's own colours in two flat tones – light and
// shade, the edge taken from the scene's directional lights – and a drawn outline (each mesh once more, pushed out
// along its normals, back faces only). On a group it reaches the models of all its children.

const SPEC = {
  description: "Toon look for the models of this node and its children: the model's colours in two flat tones (light and shade, from the scene's directional lights) and a drawn outline.",
  params: {
    shade: { kind: "color", default: "#6a5f9e", label: "shade tone", description: "The colour the shaded side is multiplied with." },
    threshold: { kind: "number", default: 0.05, min: -1, max: 1, step: 0.01, label: "shade edge", description: "Where light turns to shade: -1 = all light, 1 = all shade." },
    softness: { kind: "number", default: 0.03, min: 0, max: 0.5, step: 0.005, label: "edge softness", description: "How soft the edge between light and shade is." },
    amount: { kind: "number", default: 1, min: 0, max: 1, step: 0.05, label: "amount", description: "0 = the model's own shading, 1 = toon." },
    bright: { kind: "number", default: 1, min: 0, max: 2, step: 0.05, label: "brightness", description: "Brightness of the colours." },
    outline: { kind: "boolean", default: true, label: "outline", description: "Draw an outline around every part." },
    lineColor: { kind: "color", default: "#1b1226", label: "line colour", description: "The outline's colour." },
    lineWidth: { kind: "number", default: 0.004, min: 0, max: 0.03, step: 0.0005, label: "line width", description: "The outline's width in the model's own units." },
  },
} as const;

const TAG = "osct-toon|";
const ANCHOR = "#include <opaque_fragment>";

const DECLARATIONS = `
uniform vec3 toonShade;
uniform float toonThreshold;
uniform float toonSoftness;
uniform float toonAmount;
uniform float toonBright;
`;

const SHADE = `
  {
    vec3 toonN = normalize(nonPerturbedNormal);
    float toonD = dot(toonN, normalize(vec3(-0.35, 0.5, 0.8)));
    #if NUM_DIR_LIGHTS > 0
    float toonSum = 0.0;
    float toonWeight = 0.0;
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
      float s = dot(directionalLights[i].color, vec3(0.2126, 0.7152, 0.0722));
      toonSum += s * dot(toonN, directionalLights[i].direction);
      toonWeight += s;
    }
    if (toonWeight > 0.0) toonD = toonSum / toonWeight;
    #endif
    float toonBand = smoothstep(toonThreshold - toonSoftness, toonThreshold + toonSoftness, toonD);
    vec3 toonColor = diffuseColor.rgb * mix(toonShade, vec3(1.0), toonBand) * toonBright;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, toonColor, toonAmount);
  }
`;

export function register(api: any): void {
  api.registerComponent("toon", SPEC, ({ object, params, three }: any) => {
    const uniforms = {
      toonShade: { value: new three.Color(params.shade) },
      toonThreshold: { value: params.threshold },
      toonSoftness: { value: params.softness },
      toonAmount: { value: params.amount },
      toonBright: { value: params.bright },
    };
    const width = { value: params.lineWidth };
    let outline = params.outline;

    const line = new three.MeshBasicMaterial({ color: params.lineColor, side: three.BackSide });
    line.onBeforeCompile = (shader: any) => {
      shader.uniforms.toonLine = width;
      shader.vertexShader = "uniform float toonLine;\n" + shader.vertexShader.replace(
        "#include <begin_vertex>", "#include <begin_vertex>\n  transformed += normalize(normal) * toonLine;");
    };
    line.customProgramCacheKey = () => "osct-toon-line";

    const keyOf = (material: any): string => String(material.customProgramCacheKey());

    // The toon shading into a material, after what it already injects (a look's dissolve keeps it: it chains)
    const inject = (material: any, from: any): void => {
      const previous = from.onBeforeCompile;
      const previousKey = from.customProgramCacheKey;
      material.onBeforeCompile = (shader: any, renderer: any) => {
        previous.call(from, shader, renderer);
        const fragment: string = shader.fragmentShader;
        const main = fragment.indexOf("void main()");
        if (main < 0 || !fragment.includes(ANCHOR)) return;
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = (fragment.slice(0, main) + DECLARATIONS + fragment.slice(main)).replace(ANCHOR, ANCHOR + SHADE);
      };
      material.customProgramCacheKey = () => TAG + previousKey.call(from);
      material.needsUpdate = true;
    };

    const swapped = new Map<any, { original: any; clone: any }>();
    const hulls = new Map<any, any>();

    // Models load after the node is built and a look swaps materials: look again and again
    const scan = (): void => {
      const meshes: any[] = [];
      object.traverse((o: any) => { if (o.isMesh && !o.userData.toonLine) meshes.push(o); });
      for (const mesh of meshes) {
        const material = mesh.material;
        if (!material || Array.isArray(material)) continue;
        const key = keyOf(material);
        const dissolving = key.startsWith("dissolve-");
        if (material.isMeshStandardMaterial && !key.includes(TAG)) {
          if (dissolving) inject(material, material);
          else {
            swapped.get(mesh)?.clone.dispose();
            const clone = material.clone();
            inject(clone, material);
            mesh.material = clone;
            swapped.set(mesh, { original: material, clone });
          }
        }
        if (!hulls.has(mesh) && !dissolving && mesh.geometry?.attributes?.normal) {
          const hull = new three.Mesh(mesh.geometry, line);
          hull.userData.toonLine = true;
          hull.userData.keepMaterial = true;
          hull.raycast = () => {};
          hull.visible = outline;
          mesh.add(hull);
          hulls.set(mesh, hull);
        }
      }
    };

    let wait = 0;
    return {
      update: (delta: number) => {
        wait -= delta;
        if (wait > 0) return;
        wait = 0.1;
        scan();
      },
      tune: (next: any) => {
        uniforms.toonShade.value.set(next.shade);
        uniforms.toonThreshold.value = next.threshold;
        uniforms.toonSoftness.value = next.softness;
        uniforms.toonAmount.value = next.amount;
        uniforms.toonBright.value = next.bright;
        line.color.set(next.lineColor);
        width.value = next.lineWidth;
        outline = next.outline;
        hulls.forEach(hull => (hull.visible = outline));
        return true;
      },
      dispose: () => {
        hulls.forEach(hull => hull.removeFromParent());
        hulls.clear();
        line.dispose();
        swapped.forEach(({ original, clone }, mesh) => {
          if (mesh.material === clone) mesh.material = original;
          clone.dispose();
        });
        swapped.clear();
      },
    };
  });
}
