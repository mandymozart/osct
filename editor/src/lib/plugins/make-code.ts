import {
  componentSpec,
  type ComponentParamSpec,
  ENTITY_TYPES,
  type EntityData,
  LIGHT_PARAMS,
  materialTypes,
  type NodeSrcKind,
  nodeTypes,
  nodeTypeSpec,
  resolveLight,
  resolvePlacement,
} from "@engine/types";
import { nodeTypeRegistration } from "@engine/scene/plugins";

/**
 * **Make it code** (#188 – Unreal's *Create Blueprint class from component*): a node of any type becomes a node type of
 * the book's own. The result is a Code tab plugin whose `registerNodeType` reproduces the node – its type's builder as a
 * readable starting point (a model's clone and clips, an image's or video's plane, a text's canvas, a light, a group; a
 * plugin type's own `build`), its values as the spec's parameters with the node's values as their defaults – and the
 * node switched to that type, placed where it was. From then on the node is the author's code. **Make material code**
 * does the same for the look of a node: a `registerMaterial` that draws what the type's material drew (a plane's picture
 * as a `ShaderMaterial`, a model's as a `MeshStandardMaterial`), and the node carries it as its `material`.
 * Nothing here runs the code: the panel saves the source and runs it like the Code tab's Run.
 */

export interface MadeCode {
  /** The Code tab plugin's id (`my-model`) */
  plugin: string;
  /** The node type or material it registers (`myModel`) */
  type: string;
  /** The plugin's TypeScript */
  source: string;
  /** The node switched to it (placed where it was, its values as the new type's parameters) */
  node: EntityData;
}

/** Ids and types already taken (the book's plugin ids, every node type and material known) */
export interface Taken {
  plugins: readonly string[];
  types?: readonly string[];
}

const camel = (text: string): string => {
  const words = text.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const joined = words.map((word, i) => (i ? word[0].toUpperCase() + word.slice(1) : word[0].toLowerCase() + word.slice(1))).join("");
  return /^[a-z]/.test(joined) ? joined : `node${joined}`;
};

const kebab = (type: string): string => type.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** A free name: `base`, else `base2`, `base3` … – the type and the plugin id both free */
const freeName = (base: string, taken: Taken, kind: "node" | "material"): { type: string; plugin: string } => {
  const types = new Set([...(taken.types ?? (kind === "node" ? nodeTypes() : materialTypes())), ...ENTITY_TYPES]);
  const ids = new Set(taken.plugins);
  const clean = base.slice(0, 28);
  for (let n = 1; ; n++) {
    const type = n === 1 ? clean : `${clean}${n}`;
    if (!types.has(type) && !ids.has(kebab(type))) return { type, plugin: kebab(type) };
  }
};

/** The base name of what is made from a node: its name, else its type (`myModel` – a built-in type's name is taken) */
const baseName = (node: EntityData, suffix: string): string => {
  const named = node.name?.trim() ? camel(node.name) : "";
  if (named && named !== node.type) return `${named}${suffix}`;
  return `my${node.type[0].toUpperCase()}${node.type.slice(1)}${suffix}`;
};

/** A spec's parameters as TypeScript, with `defaults` in place of the spec's (the node's values) */
const paramsSource = (params: Record<string, ComponentParamSpec>, defaults: Record<string, unknown>, indent: string): string => {
  const entries = Object.entries(params);
  if (!entries.length) return "{}";
  const lines = entries.map(([name, param]) => {
    const value = defaults[name] !== undefined && typeof defaults[name] !== "object" ? defaults[name] : param.default;
    return `${indent}  ${name}: ${JSON.stringify({ ...param, default: value })},`;
  });
  return `{\n${lines.join("\n")}\n${indent}}`;
};

const header = (what: string, from: string): string => `import type { PluginApi } from "osct-plugin-api";

/**
 * Made with "${what}" from ${from}.
 * From here on it is the book's own code: change the build, add parameters (rows in the Entity panel), Run, Save.
 */
export const register = (api: PluginApi): void => {
  const { three } = api;
`;

/** The body of a built-in type's builder, as a plugin's `build` (the readable starting point), and what its spec says */
const builtInBuilder = (node: EntityData): { src: NodeSrcKind; params: Record<string, ComponentParamSpec>; defaults: Record<string, unknown>; build: string } => {
  switch (node.type) {
    case "model":
      return {
        src: "glb", params: {}, defaults: {},
        build: `({ asset }) => {
    if (asset?.assetType !== "glb" && asset?.assetType !== "gltf") return null;
    // The file is shared with every node that uses it: a copy of its scene per node (a skinned model needs three's SkeletonUtils)
    const model = asset.scene.clone(true);
    // Every clip of the model plays in a loop
    const mixer = asset.animations.length ? new three.AnimationMixer(model) : null;
    asset.animations.forEach(clip => mixer?.clipAction(clip).play());
    return {
      object: model,
      update: delta => mixer?.update(delta),
      dispose: () => mixer?.stopAllAction(),
    };
  }`,
      };
    case "image":
      return {
        src: "image", params: {}, defaults: {},
        build: `({ asset }) => {
    // A plane one target width wide, unlit, so the picture shows its own colours
    const material = new three.MeshBasicMaterial({ map: asset?.assetType === "image" ? asset.texture : null, side: three.DoubleSide, transparent: true });
    const mesh = new three.Mesh(new three.PlaneGeometry(1, 1), material);
    return {
      object: mesh,
      dispose: () => {
        mesh.geometry.dispose();
        material.dispose();
      },
    };
  }`,
      };
    case "video":
      return {
        src: "video", params: {}, defaults: {},
        build: `({ asset }) => {
    const video = asset?.assetType === "video" ? asset : undefined;
    const material = new three.MeshBasicMaterial({ map: video?.texture ?? null, side: three.DoubleSide });
    const mesh = new three.Mesh(new three.PlaneGeometry(1, 1), material);
    // One target width wide, as high as the video's proportions (16:9 until they are known)
    mesh.scale.y = 0.5625;
    const element = video?.element;
    const fit = () => { if (element?.videoWidth) mesh.scale.y = element.videoHeight / element.videoWidth; };
    if (element) {
      if (element.readyState >= 1) fit();
      else element.addEventListener("loadedmetadata", fit, { once: true });
    }
    return {
      object: mesh,
      onFound: () => { if (element) { element.play().catch(() => { element.muted = true; void element.play(); }); } },
      onLost: () => element?.pause(),
      onPause: () => element?.pause(),
      dispose: () => {
        element?.removeEventListener("loadedmetadata", fit);
        mesh.geometry.dispose();
        material.dispose();
      },
    };
  }`,
      };
    case "text":
      return {
        src: "none",
        params: {
          text: { kind: "string", default: "", label: "text", description: "The line shown." },
          color: { kind: "color", default: "#ffffff", label: "color", description: "The text's colour." },
        },
        defaults: { text: node.text ?? "", color: node.color ?? "#ffffff" },
        build: `({ params }) => {
    // One line on a canvas, on a plane one target width wide ({{entry.title}} is not replaced here – write the words)
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 168;
    const context = canvas.getContext("2d");
    if (context) {
      context.font = '112px Georgia, "Times New Roman", serif';
      context.textBaseline = "middle";
      context.textAlign = "center";
      context.fillStyle = String(params.color);
      context.fillText(String(params.text), canvas.width / 2, canvas.height / 2, canvas.width * 0.96);
    }
    const texture = new three.CanvasTexture(canvas);
    texture.colorSpace = three.SRGBColorSpace;
    const material = new three.MeshBasicMaterial({ map: texture, transparent: true, side: three.DoubleSide });
    const mesh = new three.Mesh(new three.PlaneGeometry(1, canvas.height / canvas.width), material);
    return {
      object: mesh,
      dispose: () => {
        mesh.geometry.dispose();
        material.dispose();
        texture.dispose();
      },
    };
  }`,
      };
    case "light": {
      const light = resolveLight(node.light);
      return {
        src: "none",
        params: LIGHT_PARAMS as unknown as Record<string, ComponentParamSpec>,
        defaults: { ...light },
        build: `({ params }) => {
    const group = new three.Group();
    const kind = String(params.kind);
    const light = kind === "spot" ? new three.SpotLight() : kind === "directional" ? new three.DirectionalLight() : new three.PointLight();
    light.color.set(String(params.color));
    group.add(light);
    if (light instanceof three.SpotLight) {
      light.angle = three.MathUtils.degToRad(Number(params.angle));
      light.penumbra = Number(params.penumbra);
    }
    // A spot and the sun aim along the node's −z
    if (light instanceof three.SpotLight || light instanceof three.DirectionalLight) {
      light.target.position.set(0, 0, -1);
      group.add(light.target);
    }
    // Intensity and reach are in target widths: scaled by the light's world scale every frame
    const scale = new three.Vector3();
    const place = () => {
      light.getWorldScale(scale);
      const s = (scale.x + scale.y + scale.z) / 3;
      if (light instanceof three.DirectionalLight) light.intensity = Number(params.intensity);
      else {
        light.decay = Number(params.decay);
        light.intensity = Number(params.intensity) * Math.pow(s, light.decay);
        light.distance = Number(params.distance) * s;
      }
    };
    place();
    return { object: group, update: place, dispose: () => light.dispose() };
  }`,
      };
    }
    default:
      return {
        src: "none", params: {}, defaults: {},
        build: `() => ({
    // A group holds its children – the engine places them; add objects of its own here
    object: new three.Group(),
  })`,
      };
  }
};

/** The build of a plugin's node type, as its plugin wrote it (compiled), for a copy */
const pluginBuilder = (type: string): string | null => {
  const build = nodeTypeRegistration(type)?.build;
  return build ? build.toString() : null;
};

/**
 * The node as a node type of the book's own: the plugin's source and the node switched to the new type. `taken` names the
 * plugin ids in use (the Code tab's and the declared ones) – the type and id are made free.
 */
export const nodeTypeCode = (node: EntityData, taken: Taken): MadeCode => {
  const { type, plugin } = freeName(baseName(node, "Code"), taken, "node");
  const spec = nodeTypeSpec(node.type);
  let src: NodeSrcKind;
  let params: Record<string, ComponentParamSpec>;
  let defaults: Record<string, unknown>;
  let build: string;
  let from: string;
  if (spec) {
    src = spec.src ?? "none";
    params = spec.params;
    defaults = { ...(node.params ?? {}) };
    const copied = pluginBuilder(node.type);
    from = `the plugin node type "${node.type}" – its build copied (a name it took from its own file must come along)`;
    build = copied ?? `({ three: t }) => ({ object: new t.Group() })`;
  } else {
    ({ src, params, defaults, build } = builtInBuilder(node));
    from = `a ${node.type} node${node.name ? ` ("${node.name}")` : ""} – the ${node.type} builder as a starting point`;
  }
  const description = `${node.name?.trim() || `A ${node.type}`}, made code from a ${node.type} node.`;
  const source = `${header("make it code", from)}  api.registerNodeType("${type}", {
    description: ${JSON.stringify(description)},
    src: "${src}",
    params: ${paramsSource(params, defaults, "    ")},
  }, ${build});
};
`;
  // The node keeps its place: the old type's placement written out (the new type's defaults lie flat)
  const placement = resolvePlacement(node.type, node.params);
  const values: Record<string, unknown> = {};
  Object.keys(params).forEach(name => { if (defaults[name] !== undefined) values[name] = defaults[name]; });
  const next: EntityData = {
    ...(node.id ? { id: node.id } : {}),
    ...(node.name ? { name: node.name } : {}),
    type,
    assets: src === "none" ? [] : node.assets,
    params: { position: placement.position, rotation: placement.rotation, scale: placement.scale, ...values },
    ...(node.material ? { material: node.material } : {}),
    ...(node.children ? { children: node.children } : {}),
  };
  // The components that apply to any node stay (a model's animation does not: the new build plays the clips)
  const components = (node.components ?? []).filter(component => !componentSpec(component.type)?.nodeTypes);
  if (components.length) next.components = components;
  return { plugin, type, source, node: next };
};

/** Node types whose own object has meshes – a material can replace theirs */
export const takesMaterial = (type: string): boolean => type !== "group" && type !== "light";

/**
 * The look of the node as a material of the book's own: a plane's picture as a `ShaderMaterial` (colour, opacity, another
 * picture), a model's or a plugin node's as a `MeshStandardMaterial`; the node carries it as its `material`.
 */
export const materialCode = (node: EntityData, taken: Taken): MadeCode => {
  const { type, plugin } = freeName(baseName(node, "Look"), taken, "material");
  const plane = node.type === "image" || node.type === "video" || node.type === "text";
  const description = plane
    ? `The picture of a ${node.type} plane, unlit, as a shader: a colour over it, its opacity, another picture.`
    : `The look of a ${node.type} node as a standard material: colour, roughness, metalness, another picture.`;
  const params: Record<string, ComponentParamSpec> = plane
    ? {
        color: { kind: "color", default: "#ffffff", label: "colour", description: "Multiplies the picture (white keeps it)." },
        opacity: { kind: "number", default: 1, min: 0, max: 1, step: 0.01, label: "opacity", description: "How opaque the plane is." },
        picture: { kind: "texture", default: "", label: "picture", description: "Another picture – empty keeps the node's own." },
      }
    : {
        color: { kind: "color", default: "#ffffff", label: "colour", description: "The base colour (multiplies the picture)." },
        roughness: { kind: "number", default: 0.6, min: 0, max: 1, step: 0.01, label: "roughness", description: "0 = a mirror, 1 = matte." },
        metalness: { kind: "number", default: 0, min: 0, max: 1, step: 0.01, label: "metalness", description: "0 = a dielectric, 1 = a metal." },
        picture: { kind: "texture", default: "", label: "picture", description: "Another picture – empty keeps the node's own." },
      };
  const build = plane
    ? `({ params, map, time }) => {
    const picture = (params.picture ?? map) as typeof map;
    return new three.ShaderMaterial({
      uniforms: {
        map: { value: picture },
        hasMap: { value: picture ? 1 : 0 },
        color: { value: new three.Color(String(params.color)) },
        opacity: { value: Number(params.opacity) },
        time,
      },
      vertexShader: \`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }\`,
      // vUv and the colorspace include last: the node's material layers add on top of this shader
      fragmentShader: \`
        uniform sampler2D map;
        uniform float hasMap;
        uniform vec3 color;
        uniform float opacity;
        uniform float time;
        varying vec2 vUv;
        void main() {
          vec4 texel = hasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0);
          gl_FragColor = vec4(texel.rgb * color, texel.a * opacity);
          #include <colorspace_fragment>
        }\`,
      transparent: true,
      side: three.DoubleSide,
    });
  }`
    : `({ params, map }) => new three.MeshStandardMaterial({
    map: (params.picture ?? map) as typeof map,
    color: new three.Color(String(params.color)),
    roughness: Number(params.roughness),
    metalness: Number(params.metalness),
  })`;
  const from = `the look of a ${node.type} node${node.name ? ` ("${node.name}")` : ""}`;
  const source = `${header("make material code", from)}  api.registerMaterial("${type}", {
    description: ${JSON.stringify(description)},
    params: ${paramsSource(params, {}, "    ")},
  }, ${build});
};
`;
  return { plugin, type, source, node: { ...node, material: { type } } };
};
