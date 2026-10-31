import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import * as esbuild from 'esbuild';
import ts from 'typescript';
import * as THREE from 'three';
import { componentSpecProblems, registerComponentSpec, type ComponentSpec } from '../../../shared/types/components';
import { PLUGIN_API_VERSION, PLUGIN_ID_PATTERN, type PluginData, type PluginRegistrations } from '../../../shared/types/plugins';
import { nodeTypeSpecProblems, registerNodeTypeSpec, type NodeTypeSpec } from '../../../shared/types/node-types';
import {
  materialSpecProblems, registerMaterialSpec, registerTextureSpec, textureSpecProblems, type MaterialSpec, type TextureSpec,
} from '../../../shared/types/materials';
import type { EntityData } from '../../../shared/types/game-config';
import { CLIENT_PUBLIC_ASSETS_DIR, CONTENT_DIR, projectRoot } from '../config';
import { buildErrors, buildWarnings, messageOf } from '../lib/errors';
import type { PluginApi } from '../../../engine/src/scene/plugins';
import { type Feedback, feedbackProblems, type FeedbackOptions, shadertoyFragment } from '../../../engine/src/scene/feedback-spec';

/**
 * The book's own code (content schema 2.4, docs/plugins.md "Shipping it: the content build"): every folder
 * `content/plugins/<id>/` with an `index.ts` is a plugin. The build
 *   1. type-checks it against the plugin API (`engine/src/scene/plugins.ts`, imported as `osct-plugin-api`) –
 *      every error with its file and line, like any other content error;
 *   2. bundles it with esbuild into one ES module (`plugin.js`, next to the source in the build output – the
 *      immutable version folder); a plugin imports nothing but types (three.js is `api.three`);
 *   3. runs the module once with a recording API: the components and material layers it registers join the
 *      registry, so the nodes that use them are checked like the built-in `animation`; the node types it registers
 *      join the node type registry, so nodes of that type pass (their parameters and file checked); its materials and
 *      procedural textures (API 1.4) join theirs, so a node's `material` and a `texture` parameter are checked;
 *      A feedback buffer (API 1.6, `api.feedback`) is no registration: the recording run checks its options and hands
 *      out a dummy handle (a texture that never changes), so a plugin that makes one in `register` records like any;
 *   4. declares it in `game.config.json`: `plugins: [{ id, src, api, registered }]` – `registered` (schema 2.14) the
 *      specs of the components, layers, node types, passes, materials and textures it registered, so the guard, the
 *      editor's API, the MCP server and the Entity panel know them without running the plugin.
 * Nothing here runs in the content build without a review: plugins live in the content source like the YAML.
 */

const PLUGINS_DIR = 'plugins';
const ENTRY = 'index.ts';
/** A bundle above this is reported (the reader downloads it with the AR chunk) */
const WARN_BYTES = 256 * 1024;
/** A node with more layers than this is reported (every layer runs on every pixel of its plane) */
export const MAX_LAYERS_UNWARNED = 3;

/** The material layer types the plugins registered (a layer is a component in the content) */
const layerTypes = new Set<string>();

export interface PluginBuild {
  data: PluginData;
  /** The bundled module */
  code: string;
}

/** The compiler options of the plugin type check: the engine's own types, three's types from scripts/ */
const compilerOptions = (): ts.CompilerOptions => ({
  strict: true,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2020.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: [],
  noEmit: true,
  skipLibCheck: true,
  isolatedModules: true,
  esModuleInterop: true,
  baseUrl: projectRoot,
  paths: {
    'osct-plugin-api': ['engine/src/scene/plugins.ts'],
    '@shared/*': ['shared/*'],
    three: ['scripts/node_modules/@types/three/index.d.ts'],
    'three/*': ['scripts/node_modules/@types/three/*'],
  },
});

/** The plugin folders of the content source, sorted; a folder with a bad name or without index.ts is an error */
export function pluginFolders(): Array<{ id: string; entry: string }> {
  const dir = path.join(CONTENT_DIR, PLUGINS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort()
    .flatMap(id => {
      if (!PLUGIN_ID_PATTERN.test(id)) {
        buildErrors.push(`plugins/${id}: a plugin folder is named with lower-case letters, digits and - (e.g. tint)`);
        return [];
      }
      const entry = path.join(dir, id, ENTRY);
      if (!fs.existsSync(entry)) {
        buildErrors.push(`plugins/${id}: missing ${ENTRY}`);
        return [];
      }
      return [{ id, entry }];
    });
}

/** Type-check every plugin against the plugin API; the diagnostics become content errors */
export function typeCheckPlugins(entries: string[]): void {
  if (!entries.length) return;
  const program = ts.createProgram(entries, compilerOptions());
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (diagnostic.file && diagnostic.start !== undefined) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      const file = path.relative(CONTENT_DIR, diagnostic.file.fileName).split(path.sep).join('/');
      buildErrors.push(`${file.startsWith('..') ? diagnostic.file.fileName : file}(${line + 1},${character + 1}): ${message}`);
    } else {
      buildErrors.push(`plugins: ${message}`);
    }
  }
}

/** Bundle one plugin into an ES module; null (with errors recorded) when it does not build */
export async function bundlePlugin(id: string, entry: string): Promise<string | null> {
  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      target: 'es2020',
      write: false,
      logLevel: 'silent',
      // A plugin imports nothing: three.js is api.three (one instance in the app), types with `import type`
      plugins: [{
        name: 'osct-no-imports',
        setup: build => build.onResolve({ filter: /^[^./]/ }, args => {
          if (args.kind === 'entry-point' || path.isAbsolute(args.path)) return undefined;
          return { errors: [{ text: `a plugin imports nothing – "${args.path}" is not available; three.js is api.three, types with \`import type\`` }] };
        }),
      }],
    });
    const code = result.outputFiles[0].text;
    if (code.length > WARN_BYTES) buildWarnings.push(`plugins/${id}: the bundle is ${Math.round(code.length / 1024)} KB – readers download it with the AR scene`);
    return code;
  } catch (error) {
    const messages = (error as { errors?: Array<{ text: string; location?: { file: string; line: number; column: number } | null }> }).errors;
    if (messages?.length) {
      messages.forEach(m => buildErrors.push(`plugins/${id}${m.location ? `/${path.basename(m.location.file)}(${m.location.line},${m.location.column + 1})` : ''}: ${m.text}`));
    } else {
      buildErrors.push(`plugins/${id}: ${messageOf(error)}`);
    }
    return null;
  }
}

/** What `api.feedback` gives the recording run: a handle that never steps, its texture an empty one */
export const dummyFeedback = (options: Partial<FeedbackOptions> | undefined): Feedback => {
  const texture = new THREE.Texture();
  return {
    texture,
    uniform: { value: texture },
    uniforms: { ...(options?.uniforms ?? {}) },
    width: Number(options?.width) || 1,
    height: Number(options?.height) || 1,
    type: options?.type ?? 'half',
    frame: 0,
    paused: true,
    reset: () => undefined,
    dispose: () => texture.dispose(),
  };
};

/** A recorded spec as the configuration holds it: plain JSON (a plugin's spec object may carry more than data) */
const plain = <T>(spec: T): T => JSON.parse(JSON.stringify(spec)) as T;

/** What one plugin registered: the type names (for the log) and the specs (the configuration's `registered`) */
export interface PluginRecord {
  types: string[];
  registered: Required<PluginRegistrations>;
}

/**
 * Run the bundled module once with a recording API: what it registers joins the registry (for the checks of the
 * nodes that use it) and is recorded – its specs go into the configuration (`registered`, schema 2.14). An exception
 * in register, an invalid spec or a type two plugins register are errors.
 */
export async function recordPlugin(id: string, code: string, taken: Map<string, string>): Promise<PluginRecord> {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'osct-plugin-')), `${id}.mjs`);
  fs.writeFileSync(file, code);
  const types: string[] = [];
  const registered: Required<PluginRegistrations> = { components: {}, nodeTypes: {}, passes: {}, materials: {}, textures: {} };
  const record: PluginRecord = { types, registered };
  const take = (type: string, spec: ComponentSpec) => {
    const problems = componentSpecProblems(type, spec);
    if (taken.has(type) && taken.get(type) !== id) problems.push(`"${type}" is registered by the plugin ${taken.get(type)} too`);
    if (problems.length) {
      problems.forEach(problem => buildErrors.push(`plugins/${id}: ${problem}`));
      return;
    }
    taken.set(type, id);
    registerComponentSpec(type, spec);
    types.push(type);
    registered.components[type] = plain(spec);
  };
  try {
    const module = (await import(pathToFileURL(file).href)) as { register?: unknown; default?: unknown };
    const register = module.register ?? module.default;
    if (typeof register !== 'function') {
      buildErrors.push(`plugins/${id}: ${ENTRY} exports no register(api) function`);
      return record;
    }
    // The engine's own API type: a method the engine adds or changes fails here first, not in a book's build
    const recording: PluginApi = {
      version: PLUGIN_API_VERSION,
      three: THREE,
      registerComponent: (type: string, spec: ComponentSpec, apply: unknown) => {
        if (typeof apply !== 'function') buildErrors.push(`plugins/${id}: ${type} needs an apply(context) function`);
        take(type, spec);
      },
      registerLayer: (type: string, spec: ComponentSpec, layer: { glsl?: unknown }) => {
        if (typeof layer?.glsl !== 'string' || !layer.glsl.trim()) buildErrors.push(`plugins/${id}: the layer ${type} needs its glsl`);
        take(type, spec);
        if (types.includes(type)) layerTypes.add(type);
      },
      // The build checks a pass's spec and factory and records it. TODO: a spread may name the pass once the guard takes plugin pass types (#97)
      registerPass: (type: string, spec: ComponentSpec, factory: unknown) => {
        const problems = componentSpecProblems(type, spec);
        if (typeof factory !== 'function') problems.push(`the pass ${type} needs a factory`);
        if (problems.length) {
          problems.forEach(problem => buildErrors.push(`plugins/${id}: ${problem}`));
          return;
        }
        registered.passes[type] = plain({ description: spec.description, params: spec.params });
      },
      // A node type (API 1.2): its spec joins the registry, so the nodes of that type are checked (params, src)
      registerNodeType: (type: string, spec: NodeTypeSpec, build: unknown) => {
        const problems = nodeTypeSpecProblems(type, spec);
        const key = `node:${type}`;
        if (taken.has(key) && taken.get(key) !== id) problems.push(`the node type "${type}" is registered by the plugin ${taken.get(key)} too`);
        if (typeof build !== 'function') problems.push(`the node type ${type} needs a build(context) function`);
        if (problems.length) {
          problems.forEach(problem => buildErrors.push(`plugins/${id}: ${problem}`));
          return;
        }
        taken.set(key, id);
        registerNodeTypeSpec(type, spec);
        types.push(type);
        registered.nodeTypes[type] = plain(spec);
      },
      // A material (API 1.4): its spec joins the registry, so a node's `material` is checked (type, parameters)
      registerMaterial: (type: string, spec: MaterialSpec, build: unknown) => {
        const problems = materialSpecProblems(type, spec);
        const key = `material:${type}`;
        if (taken.has(key) && taken.get(key) !== id) problems.push(`the material "${type}" is registered by the plugin ${taken.get(key)} too`);
        if (typeof build !== 'function') problems.push(`the material ${type} needs a build(context) function`);
        if (problems.length) {
          problems.forEach(problem => buildErrors.push(`plugins/${id}: ${problem}`));
          return;
        }
        taken.set(key, id);
        registerMaterialSpec(type, spec);
        types.push(type);
        registered.materials[type] = plain(spec);
      },
      // A procedural texture (API 1.4): its spec joins the registry, so a `texture` parameter that names it is checked
      registerTexture: (type: string, spec: TextureSpec, draw: unknown) => {
        const problems = textureSpecProblems(type, spec);
        const key = `texture:${type}`;
        if (taken.has(key) && taken.get(key) !== id) problems.push(`the texture "${type}" is registered by the plugin ${taken.get(key)} too`);
        if (typeof draw !== 'function') problems.push(`the texture ${type} needs a draw(context) function`);
        if (problems.length) {
          problems.forEach(problem => buildErrors.push(`plugins/${id}: ${problem}`));
          return;
        }
        taken.set(key, id);
        registerTextureSpec(type, spec);
        types.push(type);
        registered.textures[type] = plain(spec);
      },
      // The runtime (events, variables, progress, the spread) belongs to a running scene: here nothing happens
      events: { on: () => () => undefined, emit: () => undefined },
      vars: { get: () => undefined, set: () => undefined, on: () => () => undefined, all: () => ({}) },
      progress: { unlocked: () => false, consulted: () => false, completion: () => 0, counts: () => ({ unlocked: 0, targets: 0 }) },
      spread: { current: null, get: () => undefined },
      // A file is loaded where a build runs (a material, a pass, a node type) – never while recording
      loadText: () => Promise.resolve(''),
      // A feedback buffer (API 1.6) runs on a renderer: here its options are checked and a dummy stands in
      feedback: (options: FeedbackOptions) => {
        const problems = feedbackProblems(options);
        if (problems.length) buildErrors.push(`plugins/${id}: api.feedback – ${problems.join('; ')}`);
        return dummyFeedback(options);
      },
      shadertoy: (source: string) => shadertoyFragment(source),
      log: () => undefined,
    };
    (register as (api: PluginApi) => void)(recording);
  } catch (error) {
    buildErrors.push(`plugins/${id}: register failed – ${messageOf(error)}`);
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
  return record;
}

/**
 * Warn about every node that stacks more than MAX_LAYERS_UNWARNED layers: the phone runs them all on every pixel
 * of the plane. `nodes` = the entities to walk with a label each (the build's entries and shared entities).
 */
export function warnLayerStacks(nodes: Array<{ label: string; node: EntityData }>): void {
  const walk = (node: EntityData, label: string) => {
    const layers = (node.components ?? []).filter(c => layerTypes.has(c.type)).map(c => c.type);
    if (layers.length > MAX_LAYERS_UNWARNED) {
      buildWarnings.push(`${label}: ${layers.length} material layers on one node (${layers.join(', ')}) – every layer runs on every pixel; bake what never changes into the video`);
    }
    (node.children ?? []).forEach((child, i) => walk(child, `${label} children[${i}]`));
  };
  nodes.forEach(({ label, node }) => walk(node, label));
}

/** Every plugin of the content: type-checked, bundled, recorded – in that order; errors in buildErrors */
export async function buildPlugins(): Promise<PluginBuild[]> {
  const folders = pluginFolders();
  if (!folders.length) return [];
  console.log(`\n🧩 ${folders.length} plugin(s): ${folders.map(f => f.id).join(', ')}`);
  const before = buildErrors.length;
  typeCheckPlugins(folders.map(f => f.entry));
  if (buildErrors.length > before) return [];
  const builds: PluginBuild[] = [];
  const taken = new Map<string, string>();
  for (const { id, entry } of folders) {
    const code = await bundlePlugin(id, entry);
    if (code === null) continue;
    const { types, registered } = await recordPlugin(id, code, taken);
    console.log(`   ${id}: ${Math.round(code.length / 1024)} KB${types.length ? ` – ${types.join(', ')}` : ''}`);
    // Materials and textures (API 1.4) only when the plugin registers some
    const { materials, textures, ...kinds } = registered;
    const recorded: PluginRegistrations = { ...kinds, ...(Object.keys(materials).length ? { materials } : {}), ...(Object.keys(textures).length ? { textures } : {}) };
    builds.push({ data: { id, src: `/assets/content/${PLUGINS_DIR}/${id}/plugin.js`, api: PLUGIN_API_VERSION, registered: recorded }, code });
  }
  return builds;
}

/** The bundles into the build output, next to their sources (after the content was copied) */
export function writePluginBundles(builds: PluginBuild[]): void {
  for (const { data, code } of builds) {
    const file = path.join(CLIENT_PUBLIC_ASSETS_DIR, PLUGINS_DIR, data.id, 'plugin.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, code);
  }
}
