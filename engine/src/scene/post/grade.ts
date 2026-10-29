import { Color } from "three";
import { PASSES } from "../../types/index";
import { PassFactory, PostPass } from "./registry";

/**
 * The built-in `grade`: exposure, contrast, saturation and a tint on the AR layer only – the camera picture lies
 * under the canvas, out of reach. The layer is premultiplied: the colour is divided by the alpha before grading and
 * multiplied again after, so an edge keeps its coverage; a texel with alpha 0 (light added by a bloom) is graded as
 * it is. Contrast pivots on linear mid-grey.
 */
const FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uExposure;
  uniform float uContrast;
  uniform float uSaturation;
  uniform vec3 uTint;
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
    gl_FragColor = vec4(max(s, 0.0) * a, c.a);
  }
`;

export const gradePass: PassFactory = ({ params, shaderPass }) => {
  const uniforms = {
    uExposure: { value: Math.pow(2, params.exposure as number) },
    uContrast: { value: params.contrast as number },
    uSaturation: { value: params.saturation as number },
    uTint: { value: new Color(params.tint as string) },
  };
  const pass = shaderPass(FRAGMENT, uniforms) as PostPass;
  pass.update = next => {
    uniforms.uExposure.value = Math.pow(2, next.exposure as number);
    uniforms.uContrast.value = next.contrast as number;
    uniforms.uSaturation.value = next.saturation as number;
    uniforms.uTint.value.set(next.tint as string);
  };
  return pass;
};

export const GRADE_SPEC = PASSES.grade;
