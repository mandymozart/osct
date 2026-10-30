import type { PluginApi } from "osct-plugin-api";

/**
 * An aquarium on the page (#188): the three things a plugin can add since plugin API 1.4, together –
 *
 * - `registerTexture("caustics")`: a procedural texture – a tileable pattern of light, drawn once into a DataTexture;
 *   the floor samples it twice, drifting against each other, so the light dances without redrawing anything.
 * - `registerMaterial("water")`: a whole material – a ShaderMaterial whose vertex shader moves the top of a mesh in
 *   waves and whose fragment shader tints by depth and angle (refraction-like: what lies behind looks deeper and bluer).
 *   Any mesh node can carry it (`material: { type: water }`); here the aquarium's water does.
 * - `registerNodeType("aquarium")`: a glass tank with a sandy floor, a water volume and a few fish. Built like a glTF
 *   model – y up, its floor at y = 0 – so it stands on the page with `rotation: [90, 0, 0]`. When the node carries a
 *   material, only the water takes it: the glass, the floor and the fish say `userData.keepMaterial`.
 *
 * Light on a phone: a few hundred triangles, the caustics drawn once (128² pixels), no render target.
 */
export const register = (api: PluginApi): void => {
  const { three } = api;

  // ── the caustics: a pattern of light, tileable, drawn once; it drifts by its offset ──
  api.registerTexture("caustics", {
    description: "Light dancing on a floor under water: a tileable pattern of bright lines that drifts.",
    params: {
      size: { kind: "number", default: 128, min: 32, max: 256, step: 32, unit: "px", description: "Pixels per side: sharper, but slower to draw once." },
      cells: { kind: "number", default: 3, min: 1, max: 8, step: 1, description: "How many cells of light across one tile." },
      sharpness: { kind: "number", default: 5, min: 1, max: 12, step: 0.5, description: "How thin the lines of light are." },
      speed: { kind: "number", default: 0.04, min: 0, max: 0.5, step: 0.01, description: "How fast the pattern drifts (tiles per second)." },
    },
  }, ({ params }) => {
    const size = Math.round(Number(params.size));
    const cells = Math.round(Number(params.cells));
    const sharpness = Number(params.sharpness);
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Whole multiples of 2π across the tile: the pattern repeats without a seam
        const u = (x / size) * Math.PI * 2 * cells;
        const v = (y / size) * Math.PI * 2 * cells;
        const s = Math.sin(u + 1.6 * Math.sin(v)) + Math.sin(v + 1.6 * Math.sin(u + 1.3)) + Math.sin(u + v + 1.2 * Math.sin(u - v));
        const light = Math.pow(1 - Math.min(1, Math.abs(s) / 3), sharpness);
        const value = Math.round(255 * light);
        data.set([value, value, value, 255], (y * size + x) * 4);
      }
    }
    const texture = new three.DataTexture(data, size, size);
    texture.wrapS = texture.wrapT = three.RepeatWrapping;
    texture.magFilter = three.LinearFilter;
    texture.needsUpdate = true;
    const speed = Number(params.speed);
    return {
      texture,
      update: delta => texture.offset.set(texture.offset.x + delta * speed, texture.offset.y + delta * speed * 0.6),
    };
  });

  // ── the water: waves on the top of a mesh, a tint by depth and angle ──
  api.registerMaterial("water", {
    description: "Water: waves on the top faces, a tint that deepens with the angle and the depth, a shimmer.",
    params: {
      shallow: { kind: "color", default: "#7fd6e8", label: "shallow", description: "The water's colour where you look straight through little of it." },
      deep: { kind: "color", default: "#0b4f6c", label: "deep", description: "Its colour at a grazing angle and near the floor." },
      opacity: { kind: "number", default: 0.45, min: 0.05, max: 1, step: 0.01, description: "How much of what lies behind shows through." },
      waveHeight: { kind: "number", default: 0.012, min: 0, max: 0.05, step: 0.001, unit: "target widths", label: "wave height", description: "How high the waves on the top rise." },
      waveSpeed: { kind: "number", default: 1, min: 0, max: 4, step: 0.1, unit: "×", label: "wave speed", description: "How fast the waves run." },
      ripples: { kind: "texture", default: "", label: "ripples", description: "A picture that shimmers over the water (a Library image, or caustics) – none: the shader's own shimmer." },
    },
  }, ({ params, time }) => {
    const ripples = (params.ripples ?? null) as InstanceType<typeof three.Texture> | null;
    const uniforms = {
      time,
      shallow: { value: new three.Color(String(params.shallow)) },
      deep: { value: new three.Color(String(params.deep)) },
      opacity: { value: Number(params.opacity) },
      waveHeight: { value: Number(params.waveHeight) },
      waveSpeed: { value: Number(params.waveSpeed) },
      ripples: { value: ripples },
      hasRipples: { value: ripples ? 1 : 0 },
    };
    const material = new three.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: three.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float time;
        uniform float waveHeight;
        uniform float waveSpeed;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vToCamera;
        varying float vDepth;
        void main() {
          vUv = uv;
          vec3 p = position;
          // Only faces that look up move: the water's surface
          float top = step(0.5, normal.y);
          float t = time * waveSpeed;
          float wave = sin(p.x * 31.0 + t * 2.1) * 0.5 + sin(p.z * 41.0 - t * 1.7) * 0.3 + sin((p.x - p.z) * 19.0 + t * 1.3) * 0.2;
          p.y += top * wave * waveHeight;
          vDepth = 1.0 - clamp(uv.y, 0.0, 1.0);
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          vToCamera = -view.xyz;
          vNormalView = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * view;
        }`,
      // vUv and the colour space last: a node's material layers add on top of this shader
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform vec3 shallow;
        uniform vec3 deep;
        uniform float opacity;
        uniform sampler2D ripples;
        uniform float hasRipples;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vToCamera;
        varying float vDepth;
        void main() {
          // Refraction-like: a grazing look goes through more water – deeper, bluer, less clear
          float facing = abs(dot(normalize(vNormalView), normalize(vToCamera)));
          float through = clamp((1.0 - facing) * 0.8 + vDepth * 0.35, 0.0, 1.0);
          vec3 colour = mix(shallow, deep, through);
          float shimmer = hasRipples > 0.5
            ? texture2D(ripples, vUv * 2.0 + vec2(time * 0.03, time * 0.02)).r
            : 0.5 + 0.5 * sin(vUv.x * 47.0 + time * 1.3) * sin(vUv.y * 39.0 - time * 1.1);
          colour += shimmer * 0.08;
          gl_FragColor = vec4(colour, mix(opacity, 1.0, through * 0.5));
          #include <colorspace_fragment>
        }`,
    });
    return {
      material,
      // Colours, clarity and waves change in place; another ripples picture builds it anew
      tune: next => {
        uniforms.shallow.value.set(String(next.shallow));
        uniforms.deep.value.set(String(next.deep));
        uniforms.opacity.value = Number(next.opacity);
        uniforms.waveHeight.value = Number(next.waveHeight);
        uniforms.waveSpeed.value = Number(next.waveSpeed);
        return true;
      },
    };
  });

  // ── the aquarium: glass, a floor with caustics, water, fish ──
  const FISH_COLOURS = ["#ff8a3d", "#ffd23f", "#f25f5c", "#7bdff2", "#b9fbc0"];

  api.registerNodeType("aquarium", {
    description: "A glass tank with a sandy floor, water and fish – y up, its floor at the node's origin (stand it on the page with rotation [90, 0, 0]).",
    src: "none",
    params: {
      width: { kind: "number", default: 0.7, min: 0.1, max: 2, step: 0.01, unit: "target widths", description: "The tank's width (x)." },
      depth: { kind: "number", default: 0.4, min: 0.1, max: 2, step: 0.01, unit: "target widths", description: "The tank's depth (z)." },
      height: { kind: "number", default: 0.45, min: 0.1, max: 2, step: 0.01, unit: "target widths", description: "The tank's height (y)." },
      level: { kind: "number", default: 0.85, min: 0.2, max: 1, step: 0.01, unit: "of the height", label: "water level", description: "How full the tank is." },
      fish: { kind: "number", default: 5, min: 0, max: 12, step: 1, label: "fish", description: "How many fish swim." },
      fishSpeed: { kind: "number", default: 1, min: 0, max: 4, step: 0.1, unit: "×", label: "fish speed", description: "How fast they swim." },
      sand: { kind: "color", default: "#d9c48f", description: "The floor's colour." },
      floor: { kind: "texture", default: "caustics", label: "floor light", description: "The light on the floor: the caustics, another procedural texture or a picture – none: plain sand." },
    },
  }, ({ params }) => {
    const width = Number(params.width);
    const depth = Number(params.depth);
    const height = Number(params.height);
    const level = height * Number(params.level);
    const glassInset = 0.004;
    const tank = new three.Group();
    tank.name = "aquarium";
    const keep = <T extends InstanceType<typeof three.Object3D>>(object: T): T => {
      object.userData.keepMaterial = true;
      return object;
    };
    const disposables: Array<{ dispose(): void }> = [];
    const own = <T extends { dispose(): void }>(thing: T): T => {
      disposables.push(thing);
      return thing;
    };

    // The floor: sand lit by the caustics, sampled twice and drifting against each other
    const floorTexture = (params.floor ?? null) as InstanceType<typeof three.Texture> | null;
    const floorUniforms = {
      sand: { value: new three.Color(String(params.sand)) },
      light: { value: floorTexture },
      hasLight: { value: floorTexture ? 1 : 0 },
      scale: { value: new three.Vector2(width * 3, depth * 3) },
    };
    const floorMaterial = own(new three.ShaderMaterial({
      uniforms: floorUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sand;
        uniform sampler2D light;
        uniform float hasLight;
        uniform vec2 scale;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv * scale;
          float a = texture2D(light, uv).r;
          float b = texture2D(light, uv.yx * 0.8 + vec2(0.37, 0.11)).r;
          float caustic = hasLight > 0.5 ? min(a, b) * 1.6 + (a + b) * 0.15 : 0.0;
          gl_FragColor = vec4(sand * (0.75 + caustic), 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    const floor = keep(new three.Mesh(own(new three.PlaneGeometry(width - glassInset * 2, depth - glassInset * 2)), floorMaterial));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    tank.add(floor);

    // The water: a box whose top moves – it takes the node's material (water); without one a plain blue
    const water = new three.Mesh(
      own(new three.BoxGeometry(width - glassInset * 2, level - 0.004, depth - glassInset * 2, 32, 1, 18)),
      own(new three.MeshStandardMaterial({ color: "#5fb8d0", transparent: true, opacity: 0.35, depthWrite: false })),
    );
    water.position.y = 0.002 + (level - 0.004) / 2;
    water.renderOrder = 2;
    tank.add(water);

    // The glass: a faint box and its edges, drawn after the water
    const glass = keep(new three.Mesh(
      own(new three.BoxGeometry(width, height, depth)),
      own(new three.MeshStandardMaterial({ color: "#e6f7ff", transparent: true, opacity: 0.12, roughness: 0.05, depthWrite: false, side: three.DoubleSide })),
    ));
    glass.position.y = height / 2;
    glass.renderOrder = 3;
    tank.add(glass);
    const edges = new three.LineSegments(own(new three.EdgesGeometry(glass.geometry)), own(new three.LineBasicMaterial({ color: "#f2fbff", transparent: true, opacity: 0.7 })));
    edges.position.copy(glass.position);
    edges.renderOrder = 3;
    tank.add(edges);

    // The fish: an ellipsoid body and a flat tail, each on its own oval path at its own height
    const body = own(new three.SphereGeometry(1, 10, 6));
    const tail = own(new three.ConeGeometry(0.6, 1, 3));
    const colours = FISH_COLOURS.map(colour => own(new three.MeshStandardMaterial({ color: colour, roughness: 0.5 })));
    const size = Math.min(width, depth) * 0.08;
    const fish = Array.from({ length: Math.round(Number(params.fish)) }, (_, i) => {
      const one = new three.Group();
      const bodyMesh = keep(new three.Mesh(body, colours[i % colours.length]));
      bodyMesh.scale.set(size, size * 0.55, size * 0.35);
      const tailMesh = keep(new three.Mesh(tail, colours[i % colours.length]));
      tailMesh.scale.set(size * 0.55, size * 0.7, size * 0.12);
      tailMesh.rotation.z = -Math.PI / 2;
      tailMesh.position.x = -size * 1.15;
      one.add(bodyMesh, tailMesh);
      tank.add(one);
      return {
        one,
        tail: tailMesh,
        rx: (width / 2 - size * 2) * (0.45 + 0.5 * ((i * 37) % 10) / 10),
        rz: (depth / 2 - size * 2) * (0.4 + 0.5 * ((i * 53) % 10) / 10),
        y: 0.03 + (level - 0.08) * (((i * 29) % 10) / 10),
        speed: (0.5 + ((i * 17) % 10) / 20) * (i % 2 ? 1 : -1),
        phase: i * 1.7,
      };
    });

    let fishSpeed = Number(params.fishSpeed);
    let clock = 0;
    const swim = (delta: number) => {
      clock += delta * fishSpeed;
      for (const f of fish) {
        const a = f.phase + clock * f.speed;
        f.one.position.set(Math.cos(a) * f.rx, f.y + Math.sin(a * 3) * 0.008, Math.sin(a) * f.rz);
        // Heading along the path: the body's nose is +x, a turn by θ about y points it to (cos θ, 0, −sin θ)
        const dx = -Math.sin(a) * f.rx * Math.sign(f.speed);
        const dz = Math.cos(a) * f.rz * Math.sign(f.speed);
        f.one.rotation.y = Math.atan2(-dz, dx);
        f.tail.rotation.y = Math.sin(clock * 9 + f.phase) * 0.5;
      }
    };
    swim(0);

    return {
      object: tank,
      update: swim,
      // The fish's speed and the sand change in place; a new size, level or school builds the tank anew
      tune: next => {
        if (["width", "depth", "height", "level", "fish"].some(key => Number(next[key]) !== Number(params[key]))) return false;
        fishSpeed = Number(next.fishSpeed);
        floorUniforms.sand.value.set(String(next.sand));
        return true;
      },
      dispose: () => disposables.forEach(thing => thing.dispose()),
    };
  });
};
