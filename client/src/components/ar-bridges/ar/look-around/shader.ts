import { Matrix3, Matrix4, NoBlending, ShaderMaterial, Vector2, Vector3 } from "three";

/**
 * Sky test on the camera sample (raw sRGB): clear blue, or bright neutral grey (overcast) – light façades are
 * warm and stay real – and smooth (leaves, edges and texture are not sky). Five taps in a cross.
 */
const SKY_KEY = /* glsl */ `
  float skyColour(vec3 c) {
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    float hi = max(c.r, max(c.g, c.b));
    float lo = min(c.r, min(c.g, c.b));
    float saturation = (hi - lo) / (hi + 0.001);
    float blue = smoothstep(0.03, 0.14, c.b - c.r) * smoothstep(0.28, 0.5, lum) * (1.0 - smoothstep(0.02, 0.12, c.g - c.b));
    float grey = smoothstep(0.6, 0.8, lum) * (1.0 - smoothstep(0.1, 0.24, saturation)) * smoothstep(-0.035, 0.0, c.b - c.r);
    return max(blue, grey);
  }

  float skyMask(vec2 uv) {
    vec2 cam = (uv - 0.5) * uCover + 0.5;
    vec2 d = uTexel * 1.5;
    vec3 c0 = texture2D(tCamera, cam).rgb;
    vec3 c1 = texture2D(tCamera, cam + vec2(d.x, 0.0)).rgb;
    vec3 c2 = texture2D(tCamera, cam - vec2(d.x, 0.0)).rgb;
    vec3 c3 = texture2D(tCamera, cam + vec2(0.0, d.y)).rgb;
    vec3 c4 = texture2D(tCamera, cam - vec2(0.0, d.y)).rgb;
    float score = (skyColour(c0) + skyColour(c1) + skyColour(c2) + skyColour(c3) + skyColour(c4)) / 5.0;
    vec3 w = vec3(0.299, 0.587, 0.114);
    float l0 = dot(c0, w);
    float edge = abs(dot(c1, w) - l0) + abs(dot(c2, w) - l0) + abs(dot(c3, w) - l0) + abs(dot(c4, w) - l0);
    return score * (1.0 - smoothstep(0.06, 0.2, edge));
  }
`;

/**
 * The placeholder world: `vec3 worldColour(vec3 dir)` for a view direction in the world's own frame (y up, front
 * −z = towards the book, reader at the origin, floor at y = −1.6). An open-air café under an alien sky from simple
 * shapes (ray against sphere / disc / box) – no assets. The content's real world replaces this block.
 */
const PLACEHOLDER_WORLD = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  const vec3 LIGHT = vec3(-0.37, 0.74, 0.56);

  void orb(vec3 dir, vec3 centre, float radius, vec3 tint, inout vec3 colour, inout float nearest, inout vec3 glow) {
    float b = dot(dir, centre);
    float h = b * b - dot(centre, centre) + radius * radius;
    if (b > 0.0) glow += tint * exp(-max(length(centre - dir * b) - radius, 0.0) * 9.0) * 0.35;
    if (h < 0.0) return;
    float t = b - sqrt(h);
    if (t <= 0.0 || t >= nearest) return;
    nearest = t;
    vec3 n = normalize(dir * t - centre);
    float rim = pow(1.0 - max(dot(n, -dir), 0.0), 2.0);
    colour = tint * (0.45 + 0.55 * max(dot(n, LIGHT), 0.0)) + rim * vec3(1.0, 0.9, 1.0) * 0.6;
  }

  void table(vec3 dir, vec3 centre, float radius, vec3 tint, inout vec3 colour, inout float nearest) {
    if (abs(dir.y) < 1e-4) return;
    float t = centre.y / dir.y;
    if (t <= 0.0 || t >= nearest) return;
    float d = length(dir.xz * t - centre.xz);
    if (d > radius) return;
    nearest = t;
    colour = mix(tint * 0.35, tint * 1.4, smoothstep(radius * 0.82, radius, d));
  }

  void cube(vec3 dir, vec3 centre, float size, float turn, vec3 tint, inout vec3 colour, inout float nearest) {
    float c = cos(turn);
    float s = sin(turn);
    mat3 spin = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c) * mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
    vec3 origin = transpose(spin) * -centre;
    vec3 ray = transpose(spin) * dir;
    vec3 t1 = (-vec3(size) - origin) / ray;
    vec3 t2 = (vec3(size) - origin) / ray;
    vec3 tMin = min(t1, t2);
    vec3 tMax = max(t1, t2);
    float tNear = max(max(tMin.x, tMin.y), tMin.z);
    float tFar = min(min(tMax.x, tMax.y), tMax.z);
    if (tNear > tFar || tNear <= 0.0 || tNear >= nearest) return;
    nearest = tNear;
    vec3 hit = origin + ray * tNear;
    vec3 local = abs(hit) / size;
    vec3 n = step(max(local.yzx, local.zxy), local) * sign(hit);
    float edge = smoothstep(0.9, 0.98, max(max(min(local.x, local.y), min(local.y, local.z)), min(local.x, local.z)));
    colour = tint * (0.4 + 0.6 * max(dot(spin * n, LIGHT), 0.0)) + edge * vec3(0.6, 1.0, 0.95);
  }

  vec3 worldColour(vec3 dir) {
    float h = dir.y;
    // Sky: gradient, round twinkling stars, a moon, a ringed planet
    vec3 colour = mix(vec3(0.95, 0.45, 0.4), vec3(0.35, 0.08, 0.45), smoothstep(0.0, 0.3, h));
    colour = mix(colour, vec3(0.08, 0.02, 0.2), smoothstep(0.3, 0.9, h));
    vec2 grid = vec2(atan(dir.x, dir.z), h) * 160.0;
    vec2 cell = floor(grid);
    float star = step(0.994, hash(cell)) * (1.0 - smoothstep(0.1, 0.3, length(fract(grid) - 0.5)));
    colour += star * smoothstep(0.15, 0.5, h) * (0.6 + 0.4 * sin(uTime * 3.0 + hash(cell) * 50.0));
    float moon = smoothstep(0.075, 0.07, acos(clamp(dot(dir, normalize(vec3(0.45, 0.5, -0.75))), -1.0, 1.0)));
    colour = mix(colour, vec3(0.8, 0.95, 1.0), moon);

    float nearest = 1e9;
    vec3 glow = vec3(0.0);
    vec3 planet = normalize(vec3(-0.7, 0.55, 0.45)) * 80.0;
    orb(dir, planet, 9.0, vec3(0.55, 0.35, 0.95), colour, nearest, glow);
    vec3 ringNormal = normalize(vec3(0.25, 1.0, 0.15));
    float tRing = dot(planet, ringNormal) / dot(dir, ringNormal);
    if (tRing > 0.0 && tRing < nearest) {
      float r = length(dir * tRing - planet);
      float band = smoothstep(12.0, 12.5, r) * (1.0 - smoothstep(17.5, 18.0, r)) * (0.55 + 0.45 * sin(r * 5.0));
      colour = mix(colour, vec3(0.95, 0.85, 0.7), band * 0.85);
    }
    glow = vec3(0.0);
    nearest = 1e9;

    // Floor: a glowing grid fading into the haze
    if (h < -0.001) {
      float t = -1.6 / h;
      vec2 tile = abs(fract(dir.xz * t * 1.2) - 0.5);
      float line = smoothstep(0.44, 0.5, max(tile.x, tile.y));
      vec3 floorColour = vec3(0.06, 0.02, 0.1) + line * mix(vec3(0.2, 0.9, 0.8), vec3(0.9, 0.3, 1.0), 0.5 + 0.5 * sin(t - uTime)) * 0.7;
      colour = mix(vec3(0.3, 0.1, 0.3), floorColour, 1.0 - smoothstep(6.0, 30.0, t));
      nearest = t;
    }

    // Tables around the reader (none in front: the book is there), orbs and cubes here and there
    table(dir, vec3(-2.4, -0.8, -0.8), 0.5, vec3(1.0, 0.3, 0.65), colour, nearest);
    table(dir, vec3(2.6, -0.7, -0.4), 0.45, vec3(0.3, 0.85, 1.0), colour, nearest);
    table(dir, vec3(-1.6, -0.75, 2.4), 0.5, vec3(0.7, 0.45, 1.0), colour, nearest);
    table(dir, vec3(2.0, -0.8, 2.2), 0.5, vec3(1.0, 0.7, 0.3), colour, nearest);
    float bob = sin(uTime * 0.8);
    orb(dir, vec3(-2.2, 0.4 + 0.12 * bob, -2.8), 0.22, vec3(1.0, 0.75, 0.35), colour, nearest, glow);
    orb(dir, vec3(2.5, 0.9 - 0.1 * bob, -2.0), 0.16, vec3(1.0, 0.4, 0.8), colour, nearest, glow);
    orb(dir, vec3(-3.0, 1.3 + 0.08 * bob, 1.5), 0.3, vec3(0.4, 1.0, 0.9), colour, nearest, glow);
    orb(dir, vec3(1.8, 0.2 - 0.1 * bob, 2.6), 0.18, vec3(0.8, 0.6, 1.0), colour, nearest, glow);
    orb(dir, vec3(0.4, 1.8 + 0.15 * bob, -3.5), 0.26, vec3(0.5, 0.95, 1.0), colour, nearest, glow);
    cube(dir, vec3(3.2, 0.3, 0.3), 0.3, uTime * 0.4, vec3(0.9, 0.25, 0.6), colour, nearest);
    cube(dir, vec3(-3.4, 0.6, -0.4), 0.24, -uTime * 0.5 + 1.0, vec3(0.3, 0.6, 1.0), colour, nearest);
    return colour + glow;
  }
`;

/**
 * Per pixel: the view ray in the world (from the inverse projection and the phone's orientation), then
 * - world alpha = presence × opacity, cleared in the book's window, below `uFloor` (table and book stay real) and
 *   above ~20–45° (open roof);
 * - sky alpha = the sky test above the horizon.
 * Output is premultiplied (the canvas lies over the camera canvas); pixels with neither stay transparent at once.
 */
const COMPOSITE = /* glsl */ `
  void main() {
    vec4 point = uInverseProjection * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 ray = normalize(uRotation * (point.xyz / point.w));
    float elevation = asin(clamp(ray.y, -1.0, 1.0));

    float outside = smoothstep(uWindow.x, uWindow.y, acos(clamp(dot(ray, uBook), -1.0, 1.0)));
    float roof = 1.0 - smoothstep(0.35, 0.8, elevation);
    float floorClear = smoothstep(uFloor.x, uFloor.y, elevation);
    float world = uPresence * uOpacity * outside * roof * floorClear;
    float sky = uSky > 0.0 && elevation > 0.03 ? uSky * smoothstep(0.03, 0.3, elevation) * skyMask(vUv) : 0.0;

    float alpha = max(world, sky);
    if (alpha < 0.002) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float yc = cos(uYaw);
    float ys = sin(uYaw);
    gl_FragColor = vec4(worldColour(vec3(yc * ray.x - ys * ray.z, ray.y, ys * ray.x + yc * ray.z)), 1.0);
    #include <colorspace_fragment>
    gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
  }
`;

/** The look-around pass: one full-screen material (`FullScreenQuad`), drawn into the cleared screen */
export const lookAroundMaterial = (): ShaderMaterial => new ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uYaw: { value: 0 },
    tCamera: { value: null },
    uCover: { value: new Vector2(1, 1) },
    uTexel: { value: new Vector2(0.01, 0.01) },
    uInverseProjection: { value: new Matrix4() },
    uRotation: { value: new Matrix3() },
    uBook: { value: new Vector3(0, -1, 0) },
    uWindow: { value: new Vector2(0.3, 0.6) },
    uFloor: { value: new Vector2(-0.7, -0.44) },
    uPresence: { value: 0 },
    uOpacity: { value: 1 },
    uSky: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uYaw;
    uniform sampler2D tCamera;
    uniform vec2 uCover;
    uniform vec2 uTexel;
    uniform mat4 uInverseProjection;
    uniform mat3 uRotation;
    uniform vec3 uBook;
    uniform vec2 uWindow;
    uniform vec2 uFloor;
    uniform float uPresence;
    uniform float uOpacity;
    uniform float uSky;
    varying vec2 vUv;
    ${SKY_KEY}
    ${PLACEHOLDER_WORLD}
    ${COMPOSITE}
  `,
  blending: NoBlending,
  depthTest: false,
  depthWrite: false,
});
