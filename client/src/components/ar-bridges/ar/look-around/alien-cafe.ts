import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  RepeatWrapping,
  Points,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
} from "three";

/**
 * A placeholder world around the reader: an open-air alien coffee shop under an alien sky, built from three.js
 * primitives (no asset files). Its front (−z) faces the book; the reader stands at the origin, eyes at y = 0,
 * the floor at y = −1.3. Everything moves with `update(time)` only – no physics, nothing to load.
 */
export interface AlienCafe {
  root: Group;
  update(time: number): void;
  dispose(): void;
}

const FLOOR_Y = -1.3;

/** Sky dome: gradient, nebula, twinkling stars, two moons and a ringed planet – all in the shader */
const skyMaterial = () => new ShaderMaterial({
  side: BackSide,
  depthWrite: false,
  uniforms: { uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vDir;

    float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float noise(vec3 p) {
      vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

    vec3 body(vec3 dir, vec3 at, float radius, vec3 colour, vec3 light, inout float glow) {
      float d = acos(clamp(dot(dir, at), -1.0, 1.0));
      glow += exp(-d * 9.0 / radius * 0.1) * 0.25;
      if (d > radius) return vec3(0.0);
      // A sphere lit from one side: fake normal from the offset
      vec3 side = normalize(dir - at * dot(dir, at));
      float r = d / radius;
      vec3 n = normalize(side * r + at * sqrt(1.0 - r * r));
      float shade = clamp(dot(n, light), 0.0, 1.0);
      float craters = fbm(n * 6.0);
      return colour * (0.15 + 0.85 * shade) * (0.75 + 0.5 * craters);
    }

    void main() {
      vec3 dir = normalize(vDir);
      float h = dir.y;
      vec3 zenith = vec3(0.05, 0.01, 0.16);
      vec3 mid = vec3(0.32, 0.06, 0.42);
      vec3 horizon = vec3(0.98, 0.42, 0.36);
      vec3 colour = mix(horizon, mid, smoothstep(-0.05, 0.25, h));
      colour = mix(colour, zenith, smoothstep(0.25, 0.9, h));

      float n = fbm(dir * 3.0 + vec3(uTime * 0.01, 0.0, uTime * 0.007));
      float nebula = smoothstep(0.45, 0.85, n);
      colour += nebula * mix(vec3(0.1, 0.8, 0.7), vec3(0.9, 0.2, 0.8), fbm(dir * 5.0)) * 0.45 * smoothstep(0.0, 0.4, h);

      vec3 cell = floor(dir * 180.0);
      float star = step(0.9965, hash(cell));
      float twinkle = 0.6 + 0.4 * sin(uTime * (2.0 + hash(cell + 1.0) * 4.0) + hash(cell) * 40.0);
      colour += star * twinkle * smoothstep(0.1, 0.5, h) * vec3(1.0, 0.95, 0.85);

      float glow = 0.0;
      vec3 light = normalize(vec3(-0.6, 0.2, 0.3));
      vec3 moon1 = body(dir, normalize(vec3(0.5, 0.55, -0.65)), 0.09, vec3(0.75, 0.95, 1.0), light, glow);
      vec3 moon2 = body(dir, normalize(vec3(-0.35, 0.35, -0.85)), 0.035, vec3(1.0, 0.7, 0.4), light, glow);
      vec3 planetAt = normalize(vec3(-0.7, 0.62, 0.35));
      vec3 planet = body(dir, planetAt, 0.22, vec3(0.55, 0.35, 0.95), light, glow);
      colour += glow * vec3(0.6, 0.5, 1.0) * 0.3;
      if (dot(moon1, moon1) > 0.0) colour = moon1;
      if (dot(moon2, moon2) > 0.0) colour = moon2;

      // The planet's ring: a tilted band around it, behind the planet only where the ring is farther away
      vec3 ringNormal = normalize(vec3(0.3, 1.0, 0.2));
      vec3 toDir = dir - planetAt;
      float ringDist = abs(dot(toDir, ringNormal)) / 0.02;
      float radial = length(toDir - ringNormal * dot(toDir, ringNormal));
      float ring = (1.0 - smoothstep(0.6, 1.0, ringDist)) * smoothstep(0.25, 0.28, radial) * (1.0 - smoothstep(0.42, 0.46, radial));
      ring *= 0.55 + 0.45 * sin(radial * 180.0);
      bool front = dot(toDir, normalize(vec3(0.0, 0.0, 1.0) - planetAt)) > 0.0;
      if (dot(planet, planet) > 0.0) colour = (front && ring > 0.0) ? mix(planet, vec3(0.95, 0.85, 0.7), ring) : planet;
      else colour = mix(colour, vec3(0.95, 0.85, 0.7), ring * 0.9);

      gl_FragColor = vec4(colour, 1.0);
    }
  `,
});

/** Floor: dark stone with a glowing hex grid that pulses outward and fades with distance */
const floorMaterial = () => new ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  transparent: true,
  depthWrite: false,
  vertexShader: /* glsl */ `
    varying vec2 vPos;
    void main() {
      vPos = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vPos;
    float hexDist(vec2 p) {
      p = abs(p);
      return max(dot(p, normalize(vec2(1.0, 1.73))), p.x);
    }
    void main() {
      vec2 p = vPos * 1.6;
      vec2 r = vec2(1.0, 1.73);
      vec2 h = r * 0.5;
      vec2 a = mod(p, r) - h;
      vec2 b = mod(p - h, r) - h;
      vec2 g = dot(a, a) < dot(b, b) ? a : b;
      float edge = smoothstep(0.44, 0.5, hexDist(g));
      float d = length(vPos);
      float pulse = 0.5 + 0.5 * sin(d * 2.2 - uTime * 1.6);
      vec3 base = vec3(0.04, 0.02, 0.07);
      vec3 line = mix(vec3(0.1, 0.9, 0.8), vec3(0.9, 0.3, 1.0), pulse);
      vec3 colour = base + edge * line * (0.35 + 0.65 * pulse);
      float fade = 1.0 - smoothstep(9.0, 16.0, d);
      gl_FragColor = vec4(colour, fade);
    }
  `,
});

/** A band of alien glyphs, drawn once on a canvas */
const glyphTexture = (): Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#07020d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#5ff7e0";
  context.shadowColor = "#b04dff";
  context.shadowBlur = 12;
  context.lineWidth = 5;
  context.lineCap = "round";
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let x = 40; x < canvas.width - 40; x += 70) {
    const cx = x;
    const cy = 64;
    context.beginPath();
    const strokes = 2 + Math.floor(random() * 3);
    for (let s = 0; s < strokes; s++) {
      const kind = random();
      if (kind < 0.35) context.arc(cx + (random() - 0.5) * 20, cy + (random() - 0.5) * 40, 8 + random() * 14, random() * 6, random() * 6 + 2);
      else {
        context.moveTo(cx + (random() - 0.5) * 40, cy + (random() - 0.5) * 70);
        context.lineTo(cx + (random() - 0.5) * 40, cy + (random() - 0.5) * 70);
      }
    }
    context.stroke();
    if (random() < 0.4) {
      context.beginPath();
      context.arc(cx, cy - 34, 4, 0, Math.PI * 2);
      context.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Seen from inside the wall: mirrored back, three times around
  texture.wrapS = RepeatWrapping;
  texture.repeat.x = -3;
  return texture;
};

/** Rising steam over a cup: a few soft points that loop upward */
const steam = (count = 14): Points => {
  const geometry = new BufferGeometry();
  const seeds = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) seeds[i] = i / count;
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("seed", new BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      varying float vLife;
      void main() {
        float life = fract(seed + uTime * 0.25);
        vLife = life;
        vec3 p = vec3(sin(seed * 40.0 + uTime + life * 6.0) * 0.04 * life, life * 0.45, cos(seed * 23.0 + life * 5.0) * 0.04 * life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (18.0 + 40.0 * life) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = (1.0 - smoothstep(0.1, 0.5, d)) * sin(vLife * 3.14159) * 0.35;
        gl_FragColor = vec4(vec3(0.8, 0.95, 1.0) * a, a);
      }
    `,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return points;
};

/** A floating cup on a saucer, with steam */
const cup = (colour: Color): Group => {
  const group = new Group();
  const glaze = new MeshStandardMaterial({ color: colour, emissive: colour.clone().multiplyScalar(0.35), metalness: 0.6, roughness: 0.25 });
  const body = new Mesh(new CylinderGeometry(0.09, 0.065, 0.13, 24, 1, true), glaze);
  body.material.side = DoubleSide;
  const bottom = new Mesh(new CircleGeometry(0.065, 24), glaze);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.065;
  const handle = new Mesh(new TorusGeometry(0.04, 0.012, 8, 16), glaze);
  handle.position.set(0.1, 0, 0);
  const coffee = new Mesh(new CircleGeometry(0.085, 24), new MeshBasicMaterial({ color: 0x2a0f3a }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.045;
  const saucer = new Mesh(new CylinderGeometry(0.15, 0.1, 0.02, 32), glaze);
  saucer.position.y = -0.08;
  const vapour = steam();
  vapour.position.y = 0.06;
  group.add(body, bottom, handle, coffee, saucer, vapour);
  return group;
};

/** The barista: a floating orb with one eye that follows the reader, and rings around it */
const barista = (): { group: Group; eye: Object3D; rings: Mesh[]; skin: ShaderMaterial } => {
  const group = new Group();
  const skin = new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.5);
        vec3 core = vec3(0.12, 0.5, 0.35) * (0.6 + 0.4 * sin(uTime * 2.0));
        gl_FragColor = vec4(core + rim * vec3(0.5, 1.0, 0.8), 1.0);
      }
    `,
  });
  const body = new Mesh(new IcosahedronGeometry(0.35, 4), skin);
  const eye = new Group();
  const white = new Mesh(new SphereGeometry(0.13, 24, 16), new MeshStandardMaterial({ color: 0xf4f0ff, roughness: 0.2 }));
  const iris = new Mesh(new SphereGeometry(0.07, 24, 16), new MeshBasicMaterial({ color: 0xff3fa0 }));
  iris.position.z = 0.085;
  const pupil = new Mesh(new SphereGeometry(0.035, 16, 12), new MeshBasicMaterial({ color: 0x050008 }));
  pupil.position.z = 0.125;
  eye.add(white, iris, pupil);
  eye.position.z = 0.28;
  const rings = [0, 1, 2].map(i => {
    const ring = new Mesh(new TorusGeometry(0.5 + i * 0.09, 0.008, 6, 64), new MeshBasicMaterial({ color: i === 1 ? 0xff7ae0 : 0x6ff7ff }));
    ring.rotation.x = Math.PI / 2 + i * 0.4;
    return ring;
  });
  group.add(body, eye, ...rings);
  return { group, eye, rings, skin };
};

/** A mushroom-like table */
const table = (colour: number): Group => {
  const group = new Group();
  const material = new MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.25, roughness: 0.5 });
  const stem = new Mesh(new CylinderGeometry(0.05, 0.12, 0.9, 16), material);
  stem.position.y = 0.45;
  const top = new Mesh(new SphereGeometry(0.45, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), material);
  top.scale.y = 0.35;
  top.position.y = 0.88;
  group.add(stem, top);
  return group;
};

/** A distant spire on the horizon: dark cone with a glowing tip */
const spire = (height: number): Group => {
  const group = new Group();
  const cone = new Mesh(new ConeGeometry(height * 0.12, height, 6), new MeshBasicMaterial({ color: 0x12061c }));
  cone.position.y = height / 2;
  const tip = new Mesh(new SphereGeometry(height * 0.03, 12, 8), new MeshBasicMaterial({ color: 0xffb36b }));
  tip.position.y = height;
  group.add(cone, tip);
  return group;
};

/** A hanging lamp: a glowing orb on a thin line from above */
const lamp = (colour: number): Group => {
  const group = new Group();
  const orb = new Mesh(new SphereGeometry(0.1, 20, 12), new MeshBasicMaterial({ color: colour }));
  const halo = new Mesh(new SphereGeometry(0.2, 20, 12), new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false }));
  const line = new Mesh(new CylinderGeometry(0.004, 0.004, 3, 4), new MeshBasicMaterial({ color: 0x331144 }));
  line.position.y = 1.5;
  group.add(orb, halo, line);
  return group;
};

export const buildAlienCafe = (): AlienCafe => {
  const root = new Group();
  root.name = "alien-cafe";
  const animated: ShaderMaterial[] = [];

  const sky = skyMaterial();
  animated.push(sky);
  const dome = new Mesh(new SphereGeometry(150, 48, 24), sky);
  dome.renderOrder = -2;
  root.add(dome);

  const floorShader = floorMaterial();
  animated.push(floorShader);
  const floor = new Mesh(new CircleGeometry(16, 64), floorShader);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.renderOrder = -1;
  root.add(floor);

  root.add(new AmbientLight(0x6a4a9a, 0.9));
  root.add(new HemisphereLight(0xff9a8a, 0x1a0630, 0.8));
  const warm = new PointLight(0xffa060, 6, 8);
  warm.position.set(0, 1.2, -2.6);
  const cool = new PointLight(0x40fff0, 5, 8);
  cool.position.set(-2.5, 0.8, 1.5);
  root.add(warm, cool);

  // The counter: a curved bar in front, behind the book
  const counterMaterial = new MeshStandardMaterial({ color: 0x1b0b2e, emissive: 0x2a0a40, metalness: 0.7, roughness: 0.3, side: DoubleSide });
  const counterArc = 1.7;
  const counter = new Mesh(new CylinderGeometry(3.2, 3.2, 1.1, 64, 1, true, Math.PI - counterArc / 2, counterArc), counterMaterial);
  counter.position.y = FLOOR_Y + 0.55;
  const counterTop = new Mesh(new TorusGeometry(3.2, 0.06, 8, 64, counterArc), new MeshBasicMaterial({ color: 0x6ff7ff }));
  counterTop.rotation.set(Math.PI / 2, 0, -Math.PI / 2 - counterArc / 2);
  counterTop.position.y = FLOOR_Y + 1.1;
  root.add(counter, counterTop);

  const { group: orb, eye, rings, skin } = barista();
  orb.position.set(0, 0.15, -4.1);
  root.add(orb);
  animated.push(skin);

  // Glyph wall around the terrace
  const glyphs = glyphTexture();
  const wall = new Mesh(
    new CylinderGeometry(7, 7, 0.9, 96, 1, true),
    new MeshBasicMaterial({ map: glyphs, side: BackSide, transparent: true, opacity: 0.95 }),
  );
  wall.position.y = FLOOR_Y + 0.45;
  root.add(wall);

  // Tables around the reader (not in front – the book is there)
  const tableColours = [0xff4fa8, 0x46e0ff, 0xb46bff, 0xffb347];
  [-1.9, -2.6, 2.1, 2.7].forEach((angle, i) => {
    const t = table(tableColours[i]);
    t.position.set(Math.sin(angle) * 2.6, FLOOR_Y, -Math.cos(angle) * 2.6);
    root.add(t);
  });

  // Floating cups orbit the reader
  const cupColours = [0xff5fd2, 0x5ff7e0, 0xffd15f, 0xa47bff, 0x7bff9a, 0xff8a5f];
  const cups = cupColours.map((colour, i) => {
    const c = cup(new Color(colour));
    c.userData = { radius: 1.8 + (i % 3) * 0.5, angle: (i / cupColours.length) * Math.PI * 2, height: -0.2 + (i % 2) * 0.5, speed: 0.08 + i * 0.015 };
    root.add(c);
    c.children.forEach(child => {
      if (child instanceof Points) animated.push(child.material as ShaderMaterial);
    });
    return c;
  });

  const lampColours = [0xffc070, 0xff70c0, 0x70fff0, 0xffc070, 0xc080ff];
  const lamps = lampColours.map((colour, i) => {
    const l = lamp(colour);
    const angle = Math.PI + (i - 2) * 0.55;
    l.position.set(Math.sin(angle) * 3.4, 1.3 + (i % 2) * 0.3, Math.cos(angle) * 3.4);
    root.add(l);
    return l;
  });

  // Horizon spires
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + 0.2;
    const s = spire(8 + ((i * 7) % 5) * 4);
    const distance = 45 + ((i * 13) % 4) * 8;
    s.position.set(Math.sin(angle) * distance, FLOOR_Y - 1, Math.cos(angle) * distance);
    root.add(s);
  }

  const update = (time: number) => {
    animated.forEach(material => (material.uniforms.uTime.value = time));
    cups.forEach(c => {
      const { radius, angle, height, speed } = c.userData as { radius: number; angle: number; height: number; speed: number };
      const a = angle + time * speed;
      c.position.set(Math.sin(a) * radius, height + Math.sin(time * 0.9 + angle * 3) * 0.08, Math.cos(a) * radius);
      c.rotation.y = -a + time * 0.3;
      c.rotation.z = Math.sin(time * 0.7 + angle) * 0.12;
    });
    lamps.forEach((l, i) => {
      l.rotation.z = Math.sin(time * 0.6 + i) * 0.05;
      const glow = 0.14 + 0.08 * Math.sin(time * 3 + i * 2);
      ((l.children[1] as Mesh).material as MeshBasicMaterial).opacity = glow;
    });
    orb.position.y = 0.15 + Math.sin(time * 1.2) * 0.08;
    eye.lookAt(0, 0, 0); // the reader stands at the origin
    rings.forEach((ring, i) => (ring.rotation.z = time * (0.4 + i * 0.25) * (i % 2 ? -1 : 1)));
  };

  const dispose = () => {
    root.traverse(object => {
      if (object instanceof Mesh || object instanceof Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material: Material) => material.dispose());
      }
    });
    glyphs.dispose();
  };

  return { root, update, dispose };
};
