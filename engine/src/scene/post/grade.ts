import { Color, Texture } from "three";
import { PASSES } from "../../types/index";
import { PassFactory, PostPass } from "./registry";

/**
 * The built-in `grade`: exposure, contrast, saturation and a tint on the AR layer only – the camera picture lies
 * under the canvas, out of reach. The layer is premultiplied: the colour is divided by the alpha before grading and
 * multiplied again after, so an edge keeps its coverage; a texel with alpha 0 (light added by a bloom) is graded as
 * it is. Contrast pivots on linear mid-grey. Where the image holds the editor's desk too, the mask (the AR layer's
 * coverage) keeps the grade off it.
 */
const FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uExposure;
  uniform float uContrast;
  uniform float uSaturation;
  uniform vec3 uTint;
  uniform sampler2D tMask;
  uniform float uMasked;
  varying vec2 vUv;
  const float MID_GREY = 0.18;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float a = c.a > 0.001 ? c.a : 1.0;
    vec3 s = c.rgb / a;
    s *= uExposure * uTint;
    s = (s - MID_GREY) * uContrast + MID_GREY;
    float luma = dot(s, vec3(0.2126, 0.7152, 0.0722));
    s = mix(vec3(luma), s, uSaturation);
    vec3 graded = max(s, 0.0) * a;
    float m = uMasked > 0.5 ? texture2D(tMask, vUv).a : 1.0;
    gl_FragColor = vec4(mix(c.rgb, graded, m), c.a);
  }
`;

export const gradePass: PassFactory = ({ params, shaderPass }) => {
  const initial = {
    uExposure: { value: Math.pow(2, params.exposure as number) },
    uContrast: { value: params.contrast as number },
    uSaturation: { value: params.saturation as number },
    uTint: { value: new Color(params.tint as string) },
    tMask: { value: null as Texture | null },
    uMasked: { value: 0 },
  };
  const pass = shaderPass(FRAGMENT, initial) as PostPass;
  // The pass's own uniforms (three clones a shader object's): the live edit writes to these
  const uniforms = (pass as unknown as { uniforms: typeof initial }).uniforms;
  pass.update = next => {
    uniforms.uExposure.value = Math.pow(2, next.exposure as number);
    uniforms.uContrast.value = next.contrast as number;
    uniforms.uSaturation.value = next.saturation as number;
    uniforms.uTint.value.set(next.tint as string);
  };
  pass.setMask = mask => {
    uniforms.tMask.value = mask;
    uniforms.uMasked.value = mask ? 1 : 0;
  };
  return pass;
};

export const GRADE_SPEC = PASSES.grade;
