import type { PluginApi } from "osct-plugin-api";

/**
 * contactShadow – the soft shadow under a node, after react-three-fiber's (drei's) ContactShadows.
 *
 * No lights, no shadow maps: a small orthographic camera lies flat on the surface under the object and looks up out of
 * the page. Every frame it renders the scene into a little texture with a depth material – dark at the surface, gone
 * at its reach – blurs that twice and lays it on a plane at the same spot. Whatever floats above (the node, its
 * children, a hovering model) darkens the plane the closer it comes.
 *
 * Where and how large is the plugin's to work out, not the author's: centred under the object's footprint, half a
 * millimetre above the surface it stands over – on the editor's stage the backdrop's pages, prints and table (found
 * by a ray down the page normal), in the reader the target's own plane; 1.4 × the footprint, reaching half again the
 * object's height. The author sets how it looks: opacity, falloff, blur, smoothness, colour, resolution. It renders
 * only while the plane is on screen, and taps go through it.
 */

// One shadow renders at a time: a shadow's render never runs the others inside it
let rendering = false;

const BLUR_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
// The 9 taps of three's HorizontalBlurShader / VerticalBlurShader – the ones drei uses
const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec4 sum = vec4(0.0);
    sum += texture2D(tDiffuse, vUv - 4.0 * uStep) * 0.051;
    sum += texture2D(tDiffuse, vUv - 3.0 * uStep) * 0.0918;
    sum += texture2D(tDiffuse, vUv - 2.0 * uStep) * 0.12245;
    sum += texture2D(tDiffuse, vUv - 1.0 * uStep) * 0.1531;
    sum += texture2D(tDiffuse, vUv) * 0.1633;
    sum += texture2D(tDiffuse, vUv + 1.0 * uStep) * 0.1531;
    sum += texture2D(tDiffuse, vUv + 2.0 * uStep) * 0.12245;
    sum += texture2D(tDiffuse, vUv + 3.0 * uStep) * 0.0918;
    sum += texture2D(tDiffuse, vUv + 4.0 * uStep) * 0.051;
    gl_FragColor = sum;
  }
`;

export const register = (api: PluginApi): void => {
  const { three } = api;
  type Object3D = InstanceType<typeof three.Object3D>;

  api.registerComponent("contactShadow", {
    description: "A soft contact shadow under the node on the surface it stands over, like react-three-fiber's ContactShadows: darker the closer the node is.",
    params: {
      falloff: { kind: "number", default: 1, min: 0.2, max: 5, step: 0.1, label: "falloff", description: "How quickly the shadow fades as the object rises: 1 evenly, higher keeps it to what is close to the surface, lower stays dark further up." },
      opacity: { kind: "number", default: 0.75, min: 0, max: 1, step: 0.01, label: "opacity", description: "How dark the shadow is at its darkest." },
      blur: { kind: "number", default: 2.5, min: 0, max: 10, step: 0.1, label: "blur", description: "How soft the shadow is." },
      smooth: { kind: "boolean", default: true, label: "smooth", description: "A second, finer blur pass – smoother edges." },
      color: { kind: "color", default: "#000000", label: "colour", description: "The shadow's colour." },
      resolution: { kind: "choice", options: ["16", "32", "64", "128", "256", "512", "1024"], default: "32", label: "resolution", description: "Size of the shadow texture: 32 is soft and cheap, higher is crisper and costs more." },
    },
  }, ({ params, placed }) => {
    let p = { ...params };
    const num = (name: string) => Number(p[name]);

    // The shadow's frame: page-aligned, on the surface under the object – a child of the target's anchor, set every frame
    const frame = new three.Group();
    frame.name = "contactShadow";
    frame.matrixAutoUpdate = false;

    const size = () => Number(p.resolution) || 32;
    const target = new three.WebGLRenderTarget(size(), size());
    const targetBlur = new three.WebGLRenderTarget(size(), size());
    target.texture.generateMipmaps = targetBlur.texture.generateMipmaps = false;

    // The plane that shows it (flipped in y: the camera below looks up with its top towards -y)
    const geometry = new three.PlaneGeometry(1, 1);
    // No box: the editor's selection outline (and anything else that measures the node) leaves the shadow out; the
    // sphere stays for the frustum test
    geometry.computeBoundingSphere();
    geometry.boundingBox = new three.Box3();
    const material = new three.MeshBasicMaterial({
      map: target.texture, transparent: true, opacity: num("opacity"), depthWrite: false, toneMapped: false, side: three.DoubleSide,
    });
    const plane = new three.Mesh(geometry, material);
    plane.renderOrder = 1; // after the paper and the prints it lies on – the depth test still puts it under what is above
    plane.raycast = () => {}; // taps and the editor's picking go through it
    frame.add(plane);

    // The camera: at the plane, looking up out of the page; near a hair above it, so the surface never shades itself
    const camera = new three.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.0005, 1);
    camera.rotation.x = Math.PI;
    frame.add(camera);

    // The depth material: alpha from 1 at the plane to 0 at the reach (drei's). Both sides: from below, a video's
    // plane or a sheet of paper shows its back – one-sided it would cast nothing
    const shadowColor = { value: new three.Color(String(p.color)) };
    const falloff = { value: num("falloff") };
    const depthMaterial = new three.MeshDepthMaterial({ depthTest: false, depthWrite: false, side: three.DoubleSide });
    depthMaterial.onBeforeCompile = shader => {
      shader.uniforms.uShadowColor = shadowColor;
      shader.uniforms.uFalloff = falloff;
      shader.fragmentShader = `uniform vec3 uShadowColor;\nuniform float uFalloff;\n${shader.fragmentShader}`.replace(
        "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
        "gl_FragColor = vec4( uShadowColor, pow( 1.0 - fragCoordZ, uFalloff ) );",
      );
    };

    // The blur: a full-screen quad of its own
    const blurMaterial = new three.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uStep: { value: new three.Vector2() } },
      vertexShader: BLUR_VERTEX,
      fragmentShader: BLUR_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    const blurScene = new three.Scene();
    const blurQuad = new three.Mesh(new three.PlaneGeometry(2, 2), blurMaterial);
    blurQuad.frustumCulled = false;
    blurScene.add(blurQuad);
    const blurCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    let anchor: Object3D | null = null;
    const findAnchor = (): Object3D | null => {
      let node: Object3D = placed;
      while (node.parent && !(node.parent as { isScene?: boolean }).isScene) node = node.parent;
      return node.parent ? node : null;
    };

    // The object's box in the page's space (x right, y up the page, z out of it; 1 = the target's width) – from its
    // vertices, without the shadow. Measured ten times a second while the entity is shown, and eased towards: the
    // shadow follows a reveal, a video's plane that takes its size once the file is read, a hovering node's drift.
    const box = new three.Box3();
    const point = new three.Vector3();
    const toPage = new three.Matrix4();
    // How much of the entity is there, as the looks show it: they fade copies of its materials (fadeCode, the lift's
    // fade-in, lost) – the mean opacity of what is drawn
    let opaque = 1;
    const measure = (anchorInverse: InstanceType<typeof three.Matrix4>): boolean => {
      box.makeEmpty();
      let sum = 0;
      let count = 0;
      placed.updateWorldMatrix(true, true);
      const visit = (node: Object3D) => {
        if (node === frame || !node.visible || node.name.startsWith("editor-")) return;
        const mesh = node as InstanceType<typeof three.Mesh>;
        const position = mesh.isMesh ? mesh.geometry?.getAttribute("position") : undefined;
        if (position) {
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            // A video without its first frame yet shows nothing (the stage reveals it once it has one)
            const map = (m as { map?: { isVideoTexture?: boolean; image?: { readyState?: number } } | null }).map;
            const waiting = !!map?.isVideoTexture && (map.image?.readyState ?? 0) < 2;
            sum += !m.visible || waiting ? 0 : m.transparent ? m.opacity : 1;
            count++;
          }
          toPage.multiplyMatrices(anchorInverse, mesh.matrixWorld);
          const step = Math.max(1, Math.floor(position.count / 2000));
          for (let i = 0; i < position.count; i += step) box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(toPage));
        }
        node.children.forEach(visit);
      };
      visit(placed);
      opaque = count ? sum / count : 1;
      // A box of a few millimetres is an entity that has not appeared yet (a reveal starts from nothing)
      return !box.isEmpty() && Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) > 0.01;
    };

    // Shown: the anchor is tracked and nothing above the node is hidden – only then do its matrices mean anything
    const shown = (): boolean => {
      for (let node: Object3D | null = placed; node; node = node.parent) if (!node.visible) return false;
      return true;
    };

    // The surface under it: the stage's backdrop (the book's pages, the prints that stand a hair above them, the
    // table) found by a ray straight down the page normal from the object's top; a hit more than 0.05 below the object
    // and the page is not its surface (the floor, the sky) – then, and in the reader, which has no backdrop, it is the
    // target's own plane.
    const BACKDROP_LAYER = 1;
    const raycaster = new three.Raycaster();
    raycaster.layers.set(BACKDROP_LAYER);
    // Only surfaces: the stage's grid and its axis lines are on the backdrop too, and a line counts as hit within a
    // whole unit of the ray by default – the surface jumped to wherever an axis line stood beside the object
    raycaster.params.Line = { threshold: 0 };
    raycaster.params.Points = { threshold: 0 };
    const normal = new three.Vector3();
    const findSurface = (anchorWorld: InstanceType<typeof three.Matrix4>, anchorInverse: InstanceType<typeof three.Matrix4>, x: number, y: number, top: number, bottom: number): number => {
      if (!anchor?.parent) return 0;
      const from = new three.Vector3(x, y, top + 0.01).applyMatrix4(anchorWorld);
      raycaster.set(from, new three.Vector3(0, 0, -1).transformDirection(anchorWorld));
      for (const hit of raycaster.intersectObject(anchor.parent, true)) {
        const mesh = hit.object as InstanceType<typeof three.Mesh>;
        if (!mesh.isMesh || mesh.name.startsWith("editor-") || !hit.face) continue;
        // A surface that faces up the page normal – not a wall, an edge or the underside of something
        normal.copy(hit.face.normal).transformDirection(mesh.matrixWorld).transformDirection(anchorInverse);
        if (Math.abs(normal.z) < 0.7) continue;
        const z = point.copy(hit.point).applyMatrix4(anchorInverse).z;
        if (z <= top + 0.01 && z >= Math.min(bottom, 0) - 0.05) return z;
      }
      return 0;
    };

    const MARGIN = 1.4;
    // The shadow's share: how much of the entity its looks show – a reveal's dissolve, a find, a loss. Every look
    // writes `userData.shown` (0…1) on the object it animates (engine 1.73.0, docs/plugins.md "Code that comes and
    // goes with its entity"); a node's share is the product up its ancestors, no value = all of it. Times the opacity
    // the looks give the materials, and nothing while a video has no frame yet.
    const lookShare = (): number => {
      let share = 1;
      for (let node: Object3D | null = placed; node && node !== anchor?.parent; node = node.parent) {
        const value = node.userData.shown;
        if (typeof value === "number") share *= Math.min(1, Math.max(0, value));
      }
      return share;
    };
    let presence = 0;
    const extent = { width: 0.3, depth: 0.3, reach: 0.15 };
    const shape = () => {
      plane.scale.set(extent.width, -extent.depth, 1);
      camera.left = -extent.width / 2;
      camera.right = extent.width / 2;
      camera.top = extent.depth / 2;
      camera.bottom = -extent.depth / 2;
      camera.far = Math.max(0.002, extent.reach);
      camera.updateProjectionMatrix();
      material.opacity = num("opacity") * presence;
      shadowColor.value.set(String(p.color));
      falloff.value = num("falloff");
    };

    // What the shadow eases towards, and where it is: centre and size of the footprint, the object's top, the surface
    const goal = { x: 0, y: 0, width: 0.3, depth: 0.3, top: 0.15, surface: 0 };
    const now = { ...goal };
    let known = false; // measured once: until then the shadow stays hidden
    let sinceMeasure = Infinity;
    let sinceSearch = Infinity;
    const place = (delta: number) => {
      anchor ??= findAnchor();
      if (!anchor) return;
      // On the anchor, not in the entity: the looks (reveal, found, lost) take every mesh of the entity and would
      // dissolve and tint the shadow's plane with it
      if (frame.parent !== anchor) anchor.add(frame);
      // In the editor only in the Rendered view: the working views (Wire, Solid, Textured) show no effects of the
      // rendered picture. The stage writes its shading on the scene (engine 1.74.0); the reader writes none = rendered
      const shading = anchor.parent?.userData.shading;
      frame.visible = shown() && (shading === undefined || shading === "rendered");
      if (!frame.visible) {
        presence = 0;
        return;
      }
      anchor.updateWorldMatrix(true, false);
      placed.updateWorldMatrix(true, false);
      const anchorInverse = new three.Matrix4().copy(anchor.matrixWorld).invert();

      sinceMeasure += delta;
      if (sinceMeasure > 0.1) {
        sinceMeasure = 0;
        if (measure(anchorInverse)) {
          goal.x = (box.min.x + box.max.x) / 2;
          goal.y = (box.min.y + box.max.y) / 2;
          // A flat footprint (a standing plane) still gets some room: at least a quarter of the object's largest side
          const floor = 0.25 * Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
          goal.width = Math.max(box.max.x - box.min.x, floor);
          goal.depth = Math.max(box.max.y - box.min.y, floor);
          goal.top = box.max.z;
          // The surface twice a second (and at once the first time): the backdrop does not move under the page
          sinceSearch += 0.1;
          if (!known || sinceSearch > 0.5) {
            sinceSearch = 0;
            goal.surface = findSurface(anchor.matrixWorld, anchorInverse, goal.x, goal.y, box.max.z, box.min.z);
          }
          if (!known) Object.assign(now, goal);
          known = true;
        }
      }
      plane.visible = known;
      if (!known) return;
      const ease = 1 - Math.exp(-8 * delta);
      // The look's share every frame; the materials' opacity is measured ten times a second, so eased
      presence += (lookShare() * opaque - presence) * Math.min(1, ease * 2);
      for (const key of Object.keys(goal) as (keyof typeof goal)[]) now[key] += (goal[key] - now[key]) * ease;

      // Half a millimetre above the surface, as the stage's own layers lie: enough for the depth buffer, invisible at a
      // reading distance (the anchor's scale is the target's width in metres)
      const metres = new three.Vector3().setFromMatrixScale(anchor.matrixWorld).x || 1;
      const z = now.surface + 0.0005 / metres;
      // The footprint, and room around it for the blur
      extent.width = now.width * MARGIN;
      extent.depth = now.depth * MARGIN;
      // Half again the object's height above the shadow – at least half its footprint: a flat sheet above still casts
      extent.reach = 1.5 * Math.max(now.top - z, 0.5 * Math.max(now.width, now.depth));
      shape();
      // In the anchor's space – the page's: the footprint's centre on the surface
      frame.matrix.makeTranslation(now.x, now.y, z);
      frame.matrixWorldNeedsUpdate = true;
    };

    const clearColor = new three.Color();
    const blurPass = (amount: number, renderer: InstanceType<typeof three.WebGLRenderer>) => {
      const texel = amount / 256;
      blurMaterial.uniforms.tDiffuse.value = target.texture;
      (blurMaterial.uniforms.uStep.value as InstanceType<typeof three.Vector2>).set(texel, 0);
      renderer.setRenderTarget(targetBlur);
      renderer.render(blurScene, blurCamera);
      blurMaterial.uniforms.tDiffuse.value = targetBlur.texture;
      (blurMaterial.uniforms.uStep.value as InstanceType<typeof three.Vector2>).set(0, texel);
      renderer.setRenderTarget(target);
      renderer.render(blurScene, blurCamera);
    };

    // The shadow renders right before its plane does – the way three's Reflector renders its mirror
    plane.onBeforeRender = (renderer, scene, viewCamera) => {
      if (rendering) return;
      rendering = true;
      const before = {
        target: renderer.getRenderTarget(),
        xr: renderer.xr.enabled,
        shadowAuto: renderer.shadowMap.autoUpdate,
        autoClear: renderer.autoClear,
        clearAlpha: renderer.getClearAlpha(),
        background: scene.background,
        override: scene.overrideMaterial,
      };
      renderer.getClearColor(clearColor);
      try {
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.autoClear = true;
        renderer.setClearColor(0x000000, 0);
        plane.visible = false;
        scene.background = null;
        scene.overrideMaterial = depthMaterial;
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        scene.overrideMaterial = before.override;
        const blur = num("blur");
        if (blur > 0) {
          blurPass(blur, renderer);
          if (p.smooth) blurPass(blur * 0.4, renderer);
        }
      } finally {
        plane.visible = true;
        scene.background = before.background;
        scene.overrideMaterial = before.override;
        renderer.setClearColor(clearColor, before.clearAlpha);
        renderer.autoClear = before.autoClear;
        renderer.shadowMap.autoUpdate = before.shadowAuto;
        renderer.xr.enabled = before.xr;
        renderer.setRenderTarget(before.target);
        const viewport = (viewCamera as { viewport?: InstanceType<typeof three.Vector4> }).viewport;
        if (viewport) renderer.state.viewport(viewport);
        rendering = false;
      }
    };

    return {
      update: delta => place(delta),
      tune: next => {
        const resized = String(next.resolution) !== String(p.resolution);
        p = { ...next };
        sinceMeasure = sinceSearch = Infinity;
        if (resized) {
          target.setSize(size(), size());
          targetBlur.setSize(size(), size());
        }
        return true;
      },
      dispose: () => {
        frame.removeFromParent();
        target.dispose();
        targetBlur.dispose();
        geometry.dispose();
        material.dispose();
        depthMaterial.dispose();
        blurMaterial.dispose();
        blurQuad.geometry.dispose();
      },
    };
  });
};
