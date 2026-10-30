import { Color, type Material, Mesh, type Object3D, ShaderMaterial, type WebGLProgramParametersWithUniforms } from "three";
import type { ComponentParamSpec, ComponentSpec, EntityData } from "../types/index";
import { layersOf } from "../scene/plugins";

/**
 * Material layers (the plugin API's `registerLayer`): pieces of GLSL a plugin registers, composed into a node's
 * material after its own shading – the way `chroma-key.ts` and `celebration.ts` inject their shaders. A layer is
 * a function `vec4 (vec4 rgba, vec2 uv, float time, <parameters>)` whose body the plugin wrote; the engine
 * declares a uniform per parameter (`osctL<i>_<name>`), passes them as arguments in the spec's order, and chains
 * the layers of a node in content order on `gl_FragColor` – before tone mapping and the colour space conversion,
 * so a layer works in linear RGB like the rest of the material.
 *
 * Two kinds of material: three's own (`MeshBasicMaterial` of a video or image plane, a model's materials) get the
 * code through `onBeforeCompile` after `#include <opaque_fragment>`; a `ShaderMaterial` the engine wrote (the
 * chroma key) is patched before `#include <colorspace_fragment>`. The materials of a plane are the node's own and
 * are patched in place (the builder keeps updating their uniforms); a model's materials are shared with the cached
 * asset, so each mesh gets a patched clone, disposed with the node.
 */

const UV_BUILTIN = "#ifdef USE_MAP\n  vec2 osctUv = vMapUv;\n#else\n  vec2 osctUv = vec2(0.0);\n#endif";
const UV_SHADER = "vec2 osctUv = vUv;";

type Uniform = { value: unknown };

/** GLSL type and uniform value of a parameter kind (string parameters are not uniforms) */
const glslType = (spec: ComponentParamSpec): string | null => {
  switch (spec.kind) {
    case "number": case "boolean": return "float";
    case "color": return "vec3";
    case "choice": return "int";
    default: return null;
  }
};

const uniformValue = (spec: ComponentParamSpec, value: unknown, uniform: Uniform): void => {
  switch (spec.kind) {
    case "number": uniform.value = typeof value === "number" && Number.isFinite(value) ? value : spec.default; break;
    case "boolean": uniform.value = (typeof value === "boolean" ? value : spec.default) ? 1 : 0; break;
    case "color": {
      const color = uniform.value instanceof Color ? uniform.value : (uniform.value = new Color());
      color.set(typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : spec.default);
      break;
    }
    case "choice": {
      const index = spec.options.indexOf(String(value));
      uniform.value = index >= 0 ? index : spec.options.indexOf(spec.default);
      break;
    }
  }
};

interface LayerSlot {
  type: string;
  spec: ComponentSpec;
  /** The spec's parameters that are uniforms, in order */
  names: string[];
  uniforms: Record<string, Uniform>;
}

/** The uniforms and the GLSL of a node's layers – shared by every material of the node */
export interface LayerSet {
  /** Declarations and functions, before `void main()` */
  declarations: string;
  /** The calls on gl_FragColor, in main */
  calls: string;
  uniforms: Record<string, Uniform>;
  slots: LayerSlot[];
  time: Uniform;
}

/** Compose a node's layers (none → null) */
export const composeLayers = (node: EntityData): LayerSet | null => {
  const found = layersOf(node);
  if (!found.length) return null;
  const time: Uniform = { value: 0 };
  const uniforms: Record<string, Uniform> = { osctTime: time };
  const declarations: string[] = ["uniform float osctTime;"];
  const calls: string[] = [];
  const slots = found.map(({ data, registration, params }, i) => {
    const names = Object.keys(registration.spec.params).filter(name => glslType(registration.spec.params[name]));
    const own: Record<string, Uniform> = {};
    const args = names.map(name => {
      const spec = registration.spec.params[name];
      const uniform: Uniform = { value: null };
      uniformValue(spec, params[name], uniform);
      own[`osctL${i}_${name}`] = uniform;
      declarations.push(`uniform ${glslType(spec)} osctL${i}_${name};`);
      return `${glslType(spec)} ${name}`;
    });
    Object.assign(uniforms, own);
    declarations.push(`vec4 osctLayer${i}(vec4 rgba, vec2 uv, float time${args.map(a => `, ${a}`).join("")}) {\n${registration.layer.glsl}\n}`);
    calls.push(`gl_FragColor = osctLayer${i}(gl_FragColor, osctUv, osctTime${names.map(name => `, osctL${i}_${name}`).join("")});`);
    return { type: data.type, spec: registration.spec, names, uniforms: own };
  });
  return { declarations: declarations.join("\n"), calls: calls.join("\n  "), uniforms, slots, time };
};

/** New parameter values into the uniforms; false when the layers are not the same types in the same order */
export const tuneLayers = (set: LayerSet, node: EntityData): boolean => {
  const next = layersOf(node);
  if (next.length !== set.slots.length || next.some((l, i) => l.data.type !== set.slots[i].type)) return false;
  next.forEach(({ params }, i) => {
    const slot = set.slots[i];
    slot.names.forEach(name => uniformValue(slot.spec.params[name], params[name], slot.uniforms[`osctL${i}_${name}`]));
  });
  return true;
};

/** The fragment shader with the layers in it (`uv` = the varying of the material kind) */
export const patchFragment = (fragment: string, set: LayerSet, kind: "builtin" | "shader"): string => {
  const main = fragment.indexOf("void main()");
  if (main < 0) return fragment;
  const withDeclarations = `${fragment.slice(0, main)}${set.declarations}\n${fragment.slice(main)}`;
  const uv = kind === "builtin" ? UV_BUILTIN : UV_SHADER;
  const anchor = kind === "builtin" ? "#include <opaque_fragment>" : "#include <colorspace_fragment>";
  const at = withDeclarations.indexOf(anchor);
  if (at < 0) return withDeclarations;
  const block = `${uv}\n  ${set.calls}\n  `;
  return kind === "builtin"
    ? `${withDeclarations.slice(0, at + anchor.length)}\n  ${block}${withDeclarations.slice(at + anchor.length)}`
    : `${withDeclarations.slice(0, at)}${block}${withDeclarations.slice(at)}`;
};

let cacheKeys = 0;

/** Put the layers into one material: a ShaderMaterial in place, three's own through onBeforeCompile */
export const layerMaterial = (material: Material, set: LayerSet): void => {
  if (material instanceof ShaderMaterial) {
    Object.assign(material.uniforms, set.uniforms);
    material.fragmentShader = patchFragment(material.fragmentShader, set, "shader");
    material.needsUpdate = true;
    return;
  }
  const key = `layers-${cacheKeys++}`;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, set.uniforms);
    shader.fragmentShader = patchFragment(shader.fragmentShader, set, "builtin");
  };
  const previousKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${key}-${previousKey.call(material)}`;
  material.needsUpdate = true;
};

/**
 * Put a node's layers into its object's materials. A plane (the object is the mesh) keeps its material, patched;
 * a model's meshes get patched clones. Returns what to dispose with the node.
 */
export const layerObject = (object: Object3D, set: LayerSet): { dispose(): void } => {
  const clones: Material[] = [];
  if (object instanceof Mesh) {
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => layerMaterial(material, set));
  } else {
    object.traverse(child => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => {
        const clone = material.clone();
        layerMaterial(clone, set);
        clones.push(clone);
        return clone;
      });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });
  }
  return { dispose: () => clones.forEach(material => material.dispose()) };
};
