import type { PluginApi } from "osct-plugin-api";

/**
 * An ink painting that keeps flowing (#225): a framed canvas standing on the page whose picture is a 2D fluid simulated
 * on the GPU – plugin API 1.6's feedback buffers, fed with a Shadertoy shader through `api.shadertoy`.
 *
 * - **Buffer A** (`api.feedback`, float targets, its own previous frame as `iChannel0`): every frame it advects the
 *   velocity (xy), the density (z) and the ink (w) of the frame before, diffuses them, pushes the velocity towards no
 *   divergence and lets a pen – moved by 3D simplex noise – stir in velocity and ink.
 * - **Image** (`api.feedback` without `"self"`, one 8-bit target, Buffer A as `iChannel0`): colours the velocity's
 *   direction and scales it by the ink. The canvas's ShaderMaterial shows it (`image.uniform` follows the target).
 * - **A tap stirs** where it lands: the plugin remembers the last pointer press, and on the node's `onTap` casts it
 *   through the scene's camera (handed over in the canvas's `onBeforeRender`) onto the canvas – a swirl of velocity and
 *   ink there that fades within a second. A tap that does not aim (the editor's *tap*) stirs a random spot.
 * - The node type is built like a glTF model – y up, the frame's lowest edge at y = 0 – so `rotation: [90, 0, 0]` stands
 *   it on the page. Both buffers belong to the node: they step only while it is visible on a found page, and go with it.
 *
 * Parameters: *resolution* (256 or 512 pixels square – the phone's lever: the cost grows with the pixels), *pen speed*
 * and *ink dissipation* (both apply in place).
 *
 * ── Credits and licence ──────────────────────────────────────────────────────────────────────────────────────────────
 * The two passes below are "XlsBDf" by trapcode (https://www.shadertoy.com/view/XlsBDf, 2016-01-02), under Shadertoy's
 * default licence, Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported (CC BY-NC-SA 3.0,
 * https://creativecommons.org/licenses/by-nc-sa/3.0/). The 3D simplex noise inside Buffer A is from
 * https://www.shadertoy.com/view/XsX3zB, as credited in the original. Changes for the demo, marked `demo:` in the passes:
 * the pen's time and speed as uniforms (`penTime`, `penSpeed`), the dissipation scaled by `dissipation`, a tap's swirl
 * (`stir`), and a little friction on the velocity (without it the field saturates after a minute or two at 60 frames a
 * second and breaks into stripes – a soak test of 400 s with taps stays calm with it). The adapted shaders – this file's GLSL – are under CC BY-NC-SA 3.0 as well (share-alike): credit trapcode,
 * no commercial use, the same licence for what is made from them.
 */

const BUFFER_A = /* glsl */ `
// Shadertoy XlsBDf – Buffer A (iChannel0 = Buffer A itself, the previous frame).
// Source: https://www.shadertoy.com/view/XlsBDf – created by trapcode (2016-01-02); CC BY-NC-SA 3.0 (Shadertoy's default).
// The simplex noise below is from https://www.shadertoy.com/view/XsX3zB (as credited in the original).

uniform float penTime;     // demo: the pen's own clock (seconds × pen speed)
uniform float penSpeed;    // demo: how fast the pen moves (1 = the original)
uniform float dissipation; // demo: the ink's dissipation (1 = the original)
uniform vec4 stir;         // demo: a tap's swirl – xy its point (pixels), z its strength (0…1), w its radius² (pixels²)

/******** 3d simplex noise from https://www.shadertoy.com/view/XsX3zB ********/

/* discontinuous pseudorandom uniformly distributed in [-0.5, +0.5]^3 */
vec3 random3(vec3 c) {
	float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
	vec3 r;
	r.z = fract(512.0*j);
	j *= .125;
	r.x = fract(512.0*j);
	j *= .125;
	r.y = fract(512.0*j);
	return r-0.5;
}

/* skew constants for 3d simplex functions */
const float F3 =  0.3333333;
const float G3 =  0.1666667;

/* 3d simplex noise */
float simplex3d(vec3 p) {
	 /* 1. find current tetrahedron T and it's four vertices */
	 /* s, s+i1, s+i2, s+1.0 - absolute skewed (integer) coordinates of T vertices */
	 /* x, x1, x2, x3 - unskewed coordinates of p relative to each of T vertices*/

	 /* calculate s and x */
	 vec3 s = floor(p + dot(p, vec3(F3)));
	 vec3 x = p - s + dot(s, vec3(G3));

	 /* calculate i1 and i2 */
	 vec3 e = step(vec3(0.0), x - x.yzx);
	 vec3 i1 = e*(1.0 - e.zxy);
	 vec3 i2 = 1.0 - e.zxy*(1.0 - e);

	 /* x1, x2, x3 */
	 vec3 x1 = x - i1 + G3;
	 vec3 x2 = x - i2 + 2.0*G3;
	 vec3 x3 = x - 1.0 + 3.0*G3;

	 /* 2. find four surflets and store them in d */
	 vec4 w, d;

	 /* calculate surflet weights */
	 w.x = dot(x, x);
	 w.y = dot(x1, x1);
	 w.z = dot(x2, x2);
	 w.w = dot(x3, x3);

	 /* w fades from 0.6 at the center of the surflet to 0.0 at the margin */
	 w = max(0.6 - w, 0.0);

	 /* calculate surflet components */
	 d.x = dot(random3(s), x);
	 d.y = dot(random3(s + i1), x1);
	 d.z = dot(random3(s + i2), x2);
	 d.w = dot(random3(s + 1.0), x3);

	 /* multiply d by w^4 */
	 w *= w;
	 w *= w;
	 d *= w;

	 /* 3. return the sum of the four surflets */
	 return dot(d, vec4(52.0));
}

/*****************************************************************************/


vec2 pen(float t) {
    t *= 0.05;
    return 0.5 * iResolution.xy *
        vec2(simplex3d(vec3(t,0,0)) + 1.,
             simplex3d(vec3(0,t,0)) + 1.);
}


#define T(p) texture(iChannel0,(p)/iResolution.xy)
#define length2(p) dot(p,p)

#define dt 0.15
#define K 0.2
#define nu 0.5
#define kappa 0.1

void mainImage(out vec4 c, in vec2 p) {
    if(iFrame < 10) {
        c = vec4(0,0,1,0);
        return;
    }

    c = T(p);

    vec4 n = T(p + vec2(0,1));
    vec4 e = T(p + vec2(1,0));
    vec4 s = T(p - vec2(0,1));
    vec4 w = T(p - vec2(1,0));

    vec4 laplacian = (n + e + s + w - 4.*c);

    vec4 dx = (e - w)/2.;
    vec4 dy = (n - s)/2.;

    // velocity field divergence
    float div = dx.x + dy.y;

    // mass conservation, Euler method step
    c.z -= dt*(dx.z * c.x + dy.z * c.y + div * c.z);

    // semi-Langrangian advection
    c.xyw = T(p - dt*c.xy).xyw;

    // viscosity/diffusion
    c.xyw += dt * vec3(nu,nu,kappa) * laplacian.xyw;

    // nullify divergence with pressure field gradient
    c.xy -= K * vec2(dx.z,dy.z);

    // external source
    vec2 m = pen(penTime); // demo: penTime for iTime, the last 0.1 s scaled by penSpeed
    c.xyw += dt * exp(-length2(p - m)/50.) * vec3(m - pen(penTime-0.1*penSpeed), 1);

    // demo: a tap's swirl – the velocity drawn towards a gentle whirl around the point (1.5 at its radius), and ink;
    // drawn towards, not added to, so taps in a row never push it past what the scheme keeps stable
    vec2 r = p - stir.xy;
    float k = stir.z * exp(-length2(r)/stir.w);
    c.xy = mix(c.xy, 1.5 * vec2(-r.y, r.x) / sqrt(stir.w), min(1., 2. * dt * k));
    c.w += dt * k;

    // demo: a little friction – without it the pen's momentum builds up over a minute or two until the velocity
    // saturates and the field breaks into stripes
    c.xy *= 1. - dt*0.01;

    // dissipation
    c.w -= dt*0.0005*dissipation; // demo: × dissipation

    c.xyzw = clamp(c.xyzw, vec4(-5,-5,0.5,0), vec4(5,5,3,5));
}
`;

const IMAGE = /* glsl */ `
// Shadertoy XlsBDf – Image (iChannel0 = Buffer A). Same source and licence as Buffer A.

#define PI 3.141592653589793

void mainImage(out vec4 o, in vec2 p) {
    vec4 c = texture(iChannel0, p.xy / iResolution.xy);
    o.rgb = .6 + .6 * cos(6.3 * atan(c.y,c.x)/(2.*PI) + vec3(0,23,21)); // velocity
	o.rgb *= c.w/5.; // ink
	o.rgb += clamp(c.z - 1., 0., 1.)/10.; // local fluid density
    o.a = 1.;
}
`;

/** The painting's measures (target widths): the frame's outside, its bars, the canvas inside */
const OUTER = 0.8;
const BAR = 0.05;
const DEPTH = 0.03;
const CANVAS = OUTER - 2 * BAR;
/** A tap's swirl: how long it lasts (its strength falls by e every this many seconds) and its radius (share of the side) */
const STIR_SECONDS = 0.35;
const STIR_RADIUS = 0.05;
/** A pointer press counts as the tap's aim for this long */
const AIM_MS = 1000;

export const register = (api: PluginApi): void => {
  const { three } = api;
  const bufferA = api.shadertoy(BUFFER_A);
  const image = api.shadertoy(IMAGE);

  api.registerNodeType("inkPainting", {
    description: "A framed painting whose ink keeps flowing: a fluid simulated on the GPU every frame (Shadertoy XlsBDf by trapcode, CC BY-NC-SA 3.0). A tap stirs it where it lands.",
    src: "none",
    params: {
      resolution: { kind: "choice", options: ["256", "512"], default: "256", label: "resolution", description: "Pixels of the simulation along a side: 512 is finer and costs four times the GPU time of 256." },
      penSpeed: { kind: "number", default: 1, min: 0, max: 4, step: 0.05, unit: "×", label: "pen speed", description: "How fast the pen that stirs the ink moves (1 = the original)." },
      dissipation: { kind: "number", default: 1, min: 0, max: 200, step: 1, unit: "×", label: "ink dissipation", description: "How fast the ink fades (1 = the original, which keeps it for minutes)." },
    },
  }, ({ params }) => {
    const size = Number(params.resolution) === 512 ? 512 : 256;
    const uniforms = {
      penTime: { value: 0 },
      penSpeed: { value: Number(params.penSpeed) },
      dissipation: { value: Number(params.dissipation) },
      stir: { value: new three.Vector4(0, 0, 0, (STIR_RADIUS * size) ** 2) },
    };
    // Velocity, density and ink need more than 8 bits (negative, above 1, tiny steps): float targets where the device has them
    const fluid = api.feedback({ width: size, height: size, fragment: bufferA, uniforms, type: "float" });
    const picture = api.feedback({ width: size, height: size, fragment: image, channels: [fluid], type: "byte" });

    const painting = new three.Group();
    painting.name = "ink painting";

    // The canvas shows the Image pass: Shadertoy's colours are the screen's (sRGB), so decode them for the scene
    const canvasMaterial = new three.ShaderMaterial({
      uniforms: { picture: picture.uniform },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: /* glsl */ `
        uniform sampler2D picture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = sRGBTransferEOTF(vec4(texture2D(picture, vUv).rgb, 1.0));
          #include <colorspace_fragment>
        }
      `,
    });
    const canvas = new three.Mesh(new three.PlaneGeometry(CANVAS, CANVAS), canvasMaterial);
    canvas.position.set(0, OUTER / 2, DEPTH / 2 - 0.004);
    canvas.userData.keepMaterial = true;
    painting.add(canvas);

    // The frame: four bars, a back board and a strut behind that holds it up
    const wood = new three.MeshStandardMaterial({ color: "#3b2717", roughness: 0.55, metalness: 0.05 });
    const geometries: InstanceType<typeof three.BufferGeometry>[] = [canvas.geometry];
    const box = (width: number, height: number, depth: number, x: number, y: number, z: number) => {
      const geometry = new three.BoxGeometry(width, height, depth);
      geometries.push(geometry);
      const mesh = new three.Mesh(geometry, wood);
      mesh.position.set(x, y, z);
      painting.add(mesh);
      return mesh;
    };
    box(OUTER, BAR, DEPTH, 0, BAR / 2, 0);
    box(OUTER, BAR, DEPTH, 0, OUTER - BAR / 2, 0);
    box(BAR, CANVAS, DEPTH, -(OUTER - BAR) / 2, OUTER / 2, 0);
    box(BAR, CANVAS, DEPTH, (OUTER - BAR) / 2, OUTER / 2, 0);
    box(CANVAS, CANVAS, 0.006, 0, OUTER / 2, -DEPTH / 2 + 0.003);
    // The strut: from the back's upper third down to the page behind the painting
    const top = new three.Vector3(0, OUTER * 0.62, -DEPTH / 2);
    const foot = new three.Vector3(0, 0, -0.26);
    const length = top.distanceTo(foot);
    const strut = box(0.06, length, 0.012, 0, (top.y + foot.y) / 2, (top.z + foot.z) / 2);
    strut.rotation.x = Math.atan2(top.z - foot.z, top.y - foot.y);
    // Its lower end rests on the page: lift the box by what the tilt sinks below y = 0
    strut.position.y += Math.abs(Math.sin(strut.rotation.x)) * 0.006;

    // The aim of a tap: the last pointer press (client px) and the camera the canvas was drawn with
    let viewer: InstanceType<typeof three.Camera> | null = null;
    let element: HTMLCanvasElement | null = null;
    let pressed: { x: number; y: number; at: number } | null = null;
    canvas.onBeforeRender = (renderer, _scene, camera) => {
      viewer = camera;
      element = renderer.domElement;
    };
    const onPress = (event: PointerEvent) => { pressed = { x: event.clientX, y: event.clientY, at: performance.now() }; };
    if (typeof window !== "undefined") window.addEventListener("pointerdown", onPress, { capture: true, passive: true });
    const raycaster = new three.Raycaster();
    const pointer = new three.Vector2();
    /** Where the last press meets the canvas, in the simulation's pixels – null when it missed or is too old */
    const aim = (): [number, number] | null => {
      if (!pressed || !viewer || !element || performance.now() - pressed.at > AIM_MS) return null;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      pointer.set(((pressed.x - rect.left) / rect.width) * 2 - 1, -((pressed.y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, viewer);
      const uv = raycaster.intersectObject(canvas, false)[0]?.uv;
      return uv ? [uv.x * size, uv.y * size] : null;
    };

    return {
      object: painting,
      update: delta => {
        uniforms.penTime.value += delta * uniforms.penSpeed.value;
        uniforms.stir.value.z *= Math.exp(-delta / STIR_SECONDS);
      },
      onTap: () => {
        const [x, y] = aim() ?? [size * (0.25 + 0.5 * Math.random()), size * (0.25 + 0.5 * Math.random())];
        uniforms.stir.value.set(x, y, 1, (STIR_RADIUS * size) ** 2);
        pressed = null;
      },
      tune: next => {
        if ((Number(next.resolution) === 512 ? 512 : 256) !== size) return false;
        uniforms.penSpeed.value = Number(next.penSpeed);
        uniforms.dissipation.value = Number(next.dissipation);
        return true;
      },
      dispose: () => {
        if (typeof window !== "undefined") window.removeEventListener("pointerdown", onPress, { capture: true });
        fluid.dispose();
        picture.dispose();
        geometries.forEach(geometry => geometry.dispose());
        canvasMaterial.dispose();
        wood.dispose();
      },
    };
  });
};
