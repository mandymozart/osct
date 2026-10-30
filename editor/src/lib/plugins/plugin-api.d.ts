// The OSCT plugin API – generated from engine/src/scene/plugins.ts by editor/tools/plugin-api/generate.mjs.
// Do not edit: `npm run plugin-api` in editor/ writes it again. A plugin imports it as types only:
//   import type { PluginApi } from "osct-plugin-api";

import * as THREE from 'three';
import { AnimationClip, Group, Material, Object3D, Texture, Vector2, VideoTexture } from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

declare enum EntryCategory {
	Glossary = "glossary",
	Video = "video",
	Text = "text",
	Link = "link"
}
declare const FILTERS: {
	readonly chromaKey: {
		readonly description: "Makes one color of the video transparent \u2013 a colored background (neon green is safest) or pure black/white.";
		readonly params: {
			readonly color: {
				readonly kind: "color";
				readonly default: "#00ff00";
				readonly label: "key color";
				readonly description: "Key color (#rrggbb) that becomes transparent.";
			};
			readonly mode: {
				readonly kind: "choice";
				readonly options: readonly [
					"auto",
					"chroma",
					"luma"
				];
				readonly default: "auto";
				readonly label: "compare by";
				readonly description: string;
			};
			readonly threshold: {
				readonly kind: "number";
				readonly default: 0.3;
				readonly lumaDefault: 0.06;
				readonly min: 0;
				readonly max: 1;
				readonly label: "threshold";
				readonly description: "How close to the key color a pixel must be to disappear. Higher = more is removed.";
			};
			readonly softness: {
				readonly kind: "number";
				readonly default: 0.08;
				readonly lumaDefault: 0.1;
				readonly min: 0.001;
				readonly max: 1;
				readonly label: "soft edge";
				readonly description: "Width of the soft edge between transparent and visible. Higher = softer, more see-through edges.";
			};
			readonly spill: {
				readonly kind: "number";
				readonly default: 0.1;
				readonly min: 0.001;
				readonly max: 1;
				readonly label: "spill";
				readonly description: "Removes the key color's tint on edges (chroma only). Higher = more grey on edges.";
			};
			readonly opacity: {
				readonly kind: "number";
				readonly default: 1;
				readonly min: 0;
				readonly max: 1;
				readonly label: "opacity";
				readonly description: "Opacity of the whole video after keying. 1 = fully visible.";
			};
		};
	};
};
type FilterType = keyof typeof FILTERS;
interface FilterData {
	type: FilterType;
	[param: string]: string | number;
}
/**
 * A parameter of a spec (a component's, a material layer's, a pass's, a light's, a plugin node type's, a material's, a
 * procedural texture's): its kind with default and range, a `description` (the editor's help) and an optional `label`
 * (schema 2.15, plugin API 1.3) – the few words the editor's row shows. Without a label the row shows the name split
 * into words (`paramLabel`). A `texture` (schema 2.17, plugin API 1.4) takes a picture: a file (a Library image or
 * video, a file of the content) or a procedural texture a plugin registers (`registerTexture`) – its value is a
 * `TextureValue` (below); the engine hands the plugin's code a three.js texture.
 */
export type ComponentParamSpec = ParamText & ({
	kind: "color";
	default: string;
} | {
	kind: "number";
	default: number;
	min: number;
	max: number;
	step?: number;
	unit?: string;
} | {
	kind: "choice";
	options: readonly string[];
	default: string;
} | {
	kind: "boolean";
	default: boolean;
} | {
	kind: "string";
	default: string;
} | {
	kind: "texture";
	default: string;
});
/**
 * A texture parameter's value (schema 2.17): `""` = none; a procedural texture's type (`caustics` – camelCase, what a
 * plugin registers with `registerTexture`, with its defaults); `{ type, …parameters }` = a procedural texture with other
 * values; any other string = a file (a Library file's URL or a `/assets/content/…` path – in the content's YAML a file
 * next to the node, which the content build resolves to its path).
 */
export type TextureValue = string | {
	type: string;
	[param: string]: unknown;
};
interface ParamText {
	/**
	 * The few words the editor's row shows (schema 2.15, plugin API 1.3), e.g. `"speed"` for `degreesPerSecond` – 1 to
	 * 24 characters (`PARAM_LABEL_MAX`). Without one the row shows the name split into words ("degrees per second").
	 */
	label?: string;
	/** What the parameter does – the row's help in the editor's Info view */
	description: string;
}
export interface ComponentSpec {
	description: string;
	/** The node types it applies to (none = every type) – built-in types or a plugin's (`registerNodeType`) */
	nodeTypes?: readonly NodeType[];
	params: Record<string, ComponentParamSpec>;
}
interface ComponentData {
	type: string;
	[param: string]: unknown;
}
declare const LIGHT_KINDS: readonly [
	"point",
	"spot",
	"directional"
];
type LightKind = (typeof LIGHT_KINDS)[number];
interface LightData {
	kind?: LightKind;
	color?: string;
	intensity?: number;
	distance?: number;
	decay?: number;
	angle?: number;
	penumbra?: number;
}
export interface PassSpec {
	description: string;
	params: Record<string, ComponentParamSpec>;
}
interface PassData {
	type: string;
	[param: string]: unknown;
}
declare const NODE_SRC_KINDS: readonly [
	"none",
	"glb",
	"video",
	"image"
];
export type NodeSrcKind = (typeof NODE_SRC_KINDS)[number];
export interface NodeTypeSpec {
	description: string;
	/** The file its `src` takes (default `none`: the node has no file) */
	src?: NodeSrcKind;
	/** Its parameters, set in the node's `params` (never `position`, `rotation` or `scale` – the placement's) */
	params: Record<string, ComponentParamSpec>;
}
export interface MaterialSpec {
	description: string;
	/** The node types it applies to (none = every node with meshes) – built-in types or a plugin's */
	nodeTypes?: readonly string[];
	/** Its parameters, set in the node's `material.params` */
	params: Record<string, ComponentParamSpec>;
}
export interface TextureSpec {
	description: string;
	/** Its parameters, set in a texture value `{ type, …parameters }` (a plain type takes the defaults) */
	params: Record<string, ComponentParamSpec>;
}
interface MaterialData {
	type: string;
	params?: Record<string, unknown>;
}
declare const BEHAVIOUR_SCOPES: readonly [
	"spread",
	"stage",
	"session",
	"book"
];
type BehaviourScope = (typeof BEHAVIOUR_SCOPES)[number];
type BehaviourValue = string | number | boolean;
declare const ENTITY_TYPES: readonly [
	"group",
	"model",
	"video",
	"image",
	"text",
	"light"
];
type EntityType = (typeof ENTITY_TYPES)[number];
type NodeType = EntityType | (string & {});
declare const ASSET_TYPES: readonly [
	"glb",
	"gltf",
	"video",
	"image",
	"audio"
];
type AssetType = (typeof ASSET_TYPES)[number];
declare const SPREAD_FORMATS: readonly [
	"spread",
	"cover",
	"back"
];
type SpreadFormat = (typeof SPREAD_FORMATS)[number];
interface SpreadData {
	id: string;
	title: string;
	firstPage: number;
	lastPage: number;
	/** Optional (schema 2.3): `cover` or `back` for the covers, `spread` or none for a double page */
	format?: SpreadFormat;
	/** Optional (schema 2.5): the post-processing passes over this spread's rendered image, in order; replaces the book's (`[]` = none) */
	passes?: PassData[];
}
interface AssetData {
	id: string;
	assetType: AssetType;
	src: string;
}
interface EntityData {
	/** Optional, unique within the tree: the editor's selection */
	id?: string;
	/**
	 * Optional (schema 2.12): the node's name for the people who make the book – the editor's tree shows it; a behaviour's
	 * action names a node of its subtree by it (schema 2.19)
	 */
	name?: string;
	/** A built-in type (ENTITY_TYPES) or a plugin's (schema 2.13) */
	type: NodeType;
	/** The node's own files (a model, a video, an image); empty for `group`, `text` and `light` (a plugin's type: its spec's `src`) */
	assets: AssetData[];
	/** Placement: position / rotation / scale (see ./placement.ts); a plugin node type's parameters (schema 2.13, `./node-types.ts`) */
	params?: Record<string, unknown>;
	filters?: FilterData[];
	/**
	 * Components applied to this node (schema 2.2 – `componentSpec`): the built-in `animation` on a model and `behaviour`
	 * (schema 2.19, rules without code – `./behaviour.ts`), a plugin's component or material layer (schema 2.4)
	 */
	components?: ComponentData[];
	/**
	 * Optional (schema 2.17): a material a plugin registered (`registerMaterial`) that replaces the material of the node's
	 * meshes – its type and values (`./materials.ts`); the node's material layers still add on top
	 */
	material?: MaterialData;
	/** Child nodes, placed relative to this one */
	children?: EntityData[];
	/** `text` nodes: the line shown; `{{entry.title}}` and `{{book.title}}` are replaced */
	text?: string;
	/** `text` nodes: the colour, `#rrggbb` (default white) */
	color?: string;
	/** `light` nodes (schema 2.6 – `LIGHT_PARAMS`): kind, colour, intensity, …; every value optional */
	light?: LightData;
}
interface EntityRefData {
	ref: string;
}
declare const PRINT_SURFACES: readonly [
	"left",
	"right",
	"front",
	"back"
];
type PrintSurface = (typeof PRINT_SURFACES)[number];
interface PrintPlacement {
	page?: number;
	surface: PrintSurface;
	x: number;
	y: number;
	width: number;
	height?: number;
}
interface TargetData {
	id: string;
	imageSrc: string;
	entity?: EntityData | EntityRefData;
	/** Where it is printed (optional, schema 2.1 – targets made in the editor carry it) */
	print?: PrintPlacement;
}
interface EntryData {
	id: string;
	category: EntryCategory;
	title: string;
	page: number;
	body: string;
	author?: string;
	image?: string;
	media?: string;
	tags: string[];
	target?: TargetData;
}
interface Target extends Omit<TargetData, "entity"> {
	entryId: string;
	spreadId: string;
	entity?: EntityData;
}
interface Entry extends Omit<EntryData, "target"> {
	spreadId: string;
	target?: Target;
}
interface Spread extends SpreadData {
	/** Every entry on the spread's pages, with or without target */
	entries: Entry[];
	/** In entry order (page → title) */
	targets: Target[];
}
type LoadedAsset = {
	assetType: "glb" | "gltf";
	scene: Group;
	animations: AnimationClip[];
} | {
	assetType: "image";
	texture: Texture;
} | {
	assetType: "video";
	element: HTMLVideoElement;
	texture: VideoTexture;
} | {
	assetType: "audio";
	element: HTMLAudioElement;
};
/**
 * The plugin runtime behind `api.events`, `api.vars`, `api.progress` and `api.spread` (plugin API 1.1,
 * docs/plugins.md "Across nodes and pages"): what lets a book's code reach across nodes and pages.
 *
 * - **Events** have two owners (the concept's rule): *core events* describe the book and are emitted by the scene
 *   only (`CORE_EVENTS` – a plugin that emits one gets an error); *scene events* are the content's own, any other
 *   name, emitted and heard by plugins freely. One flat bus: every plugin on the stage hears every event.
 * - **Variables** live in a scope: `spread` while the spread is the current one, `stage` while the scene exists,
 *   `session` per app start, `book` persisted with the reader's progress (through the app's `ProgressReader`;
 *   in memory without one). A read without a scope looks outward – spread, stage, session, book – and the innermost
 *   definition wins. Every write emits the core event `varChanged`.
 * - **Progress** is read-only for plugins and comes from the app (`ArSceneOptions.progress`): unlocked targets,
 *   consulted entries, completion – never the app's store itself.
 * - **The spread** is the engine's own content model of the current spread.
 *
 * Listeners are kept per plugin id so that uninstalling a plugin (the editor's Run) removes them.
 *
 * The vocabulary – the scopes, the core events' names, the name pattern and the value type – is the behaviour
 * grammar's (`shared/types/behaviour.ts`): a behaviour rule and a plugin speak the same words.
 */
/** A variable's value: a JSON scalar; `null` on a write deletes the variable */
export type VarValue = BehaviourValue;
export type VarScope = BehaviourScope;
declare const SCENE_STATES: readonly [
	"running",
	"paused",
	"stopped"
];
export type SceneStateName = (typeof SCENE_STATES)[number];
/** The core events: the scene emits them, plugins subscribe */
export interface CoreEvents {
	targetFound: {
		targetId: string;
	};
	targetLost: {
		targetId: string;
	};
	/** The first find of a target (the app's progress tells the scene through `celebrate`) */
	targetUnlocked: {
		targetId: string;
	};
	targetTapped: {
		targetId: string;
	};
	spreadChanged: {
		spreadId: string;
		previous: string | null;
	};
	sceneState: {
		state: SceneStateName;
	};
	varChanged: {
		name: string;
		scope: VarScope;
		value: VarValue | undefined;
		previous: VarValue | undefined;
	};
}
type EventListener$1<P = unknown> = (payload: P) => void;
/** `api.events` */
export interface PluginEvents {
	/** Hear a core event or a scene event; returns the unsubscribe (a plugin's listeners go when it is uninstalled) */
	on<E extends keyof CoreEvents>(event: E, listener: EventListener$1<CoreEvents[E]>): () => void;
	on(event: string, listener: EventListener$1): () => void;
	/** Emit a scene event (any name that is not a core event) to every plugin on the stage */
	emit(event: string, payload?: unknown): void;
}
/** `api.vars` */
export interface PluginVars {
	/** The value in `scope`, or without one the innermost definition (spread → stage → session → book) */
	get(name: string, scope?: VarScope): VarValue | undefined;
	/** Set (or delete with `null`) a variable in a scope – `spread` by default */
	set(name: string, value: VarValue | null, scope?: VarScope): void;
	/** Hear every change of a variable (in any scope) */
	on(name: string, listener: (value: VarValue | undefined, previous: VarValue | undefined, scope: VarScope) => void): () => void;
	/** Every variable of a scope */
	all(scope: VarScope): Record<string, VarValue>;
}
/** `api.progress` – read-only */
export interface PluginProgress {
	unlocked(targetId: string): boolean;
	consulted(entryId: string): boolean;
	/** Unlocked targets of a spread (the whole book without an id) as 0–1; a spread without targets counts as complete */
	completion(spreadId?: string): number;
	counts(spreadId?: string): {
		unlocked: number;
		targets: number;
	};
}
/** `api.spread` */
export interface PluginSpread {
	/** The current spread as the engine knows it, null before the first spread */
	readonly current: Spread | null;
	get(spreadId: string): Spread | undefined;
}
/**
 * The pass registry: every post-processing type the engine can run – the built-in ones (`./bloom`, `./vignette`,
 * `./grade`, registered by `./index`) and a plugin's own, registered through the plugin API's `registerPass` with
 * the plugin as the owner. The content names passes by type (`passes: [{ type, …params }]`, `shared/types/passes.ts`);
 * `PostChain` builds them from here.
 *
 * A pass is a three.js `Pass` (`render(renderer, writeBuffer, readBuffer)` over the composer's buffers): the read
 * buffer holds the AR layer as the scene rendered it – premultiplied colour over alpha, in linear RGB, nothing of
 * the camera picture, which lies under the canvas (in the editor the stage's desk stands in for it and is part of
 * the buffer: the passes shade it like the camera picture, a grade with `reach: ar` is limited to the AR layer by `setMask`;
 * the look-around world and sky, while drawn, lie in the buffer under the AR layer the same way).
 * A pass that writes alpha 1 everywhere would cover the camera picture with black: a pass keeps the texel's alpha unless it means to shade the camera picture too (a vignette
 * raises the alpha where it darkens – the picture below shows through less).
 */
/** What a pass factory gets */
export interface PassContext {
	/** The pass's parameters with the spec's defaults filled in */
	params: Record<string, unknown>;
	/** The app's three.js (one instance – a plugin never imports three itself) */
	three: typeof THREE;
	/** three's `ShaderPass` (`new ShaderPass({ uniforms, vertexShader, fragmentShader })`) */
	ShaderPass: typeof ShaderPass;
	/** The canvas size in CSS px and the renderer's pixel ratio */
	size: Vector2;
	pixelRatio: number;
	/**
	 * A full-screen shader pass from a fragment shader: `tDiffuse` (the image so far) and `vUv` are defined, the
	 * vertex shader is the standard one; `uniforms` are added to it
	 */
	shaderPass(fragmentShader: string, uniforms?: Record<string, {
		value: unknown;
	}>): ShaderPass;
}
/** A registered pass: three's `Pass`, optionally with `update` for new parameter values in place (the editor's live edit) */
export interface PostPass extends Pass {
	update?(params: Record<string, unknown>): void;
	/**
	 * The AR layer's coverage (its alpha) while the image holds more than the AR layer – the editor's stage, where the
	 * desk stands in for the camera picture, or the look-around world and sky under the scene; `null` while the image
	 * is the AR layer alone. A pass that reaches the AR layer only (the grade with `reach: ar`) limits itself to it with
	 * this.
	 */
	setMask?(mask: THREE.Texture | null): void;
}
export type PassFactory = (context: PassContext) => PostPass;
/**
 * A node's material of a plugin (plugin API 1.4, content schema 2.17 – `api.registerMaterial`): the node's
 * `material: { type, params }` names a material a plugin registered; its `build` makes a three.js material (a
 * `ShaderMaterial` with GLSL of its own, a `MeshStandardMaterial` with a procedural texture …) and the engine puts it on
 * every mesh of the node's own object, in place of the material its type made (a model's, an image's or video's plane,
 * a plugin node's). The node's material layers then add on top (`utils/layers.ts` patches the plugin's material in
 * place – a `ShaderMaterial` takes them before `#include <colorspace_fragment>` and reads `vUv`). Texture parameters
 * arrive as three.js textures (`textures.ts`); `time` is a uniform the engine advances every frame, so a shader can use
 * it directly (`uniforms: { time }`).
 */
/** What a material's `build` gets */
export interface MaterialContext {
	node: EntityData;
	/** The material's parameters with the spec's defaults filled in – a `texture` parameter as a three.js `Texture` (or null) */
	params: Record<string, unknown>;
	/** Seconds since the material was built, as a uniform the engine advances every frame (`uniforms: { time }`) */
	time: {
		value: number;
	};
	/**
	 * The picture of the material it replaces – an image's or video's texture, a model's base colour map – or null: a
	 * material that keeps the node's own picture reads it here
	 */
	map: Texture | null;
	target: Target;
	/** The app's three.js (one instance – plugins never import three themselves) */
	three: typeof THREE;
}
/** What `build` returns when it needs more than the material: hooks, as a node type's */
export interface MaterialInstance {
	material: Material;
	/** Every frame (seconds since the last one) – `time` advances by itself */
	update?(delta: number): void;
	/** Other parameter values in place (the editor's live edit); false = the material is built anew */
	tune?(params: Record<string, unknown>): boolean;
	/** Free what the build made beside the material (the engine disposes the material) */
	dispose?(): void;
}
/** Builds the material: a three.js material, or a `MaterialInstance` with hooks */
export type MaterialBuild = (context: MaterialContext) => Material | MaterialInstance | null | void;
/**
 * Texture parameters (plugin API 1.4, content schema 2.17): a spec's parameter of kind `texture` takes a file – a Library
 * image or video, a file of the content – or a procedural texture a plugin registered (`api.registerTexture`, drawn by
 * its code: a canvas or a data texture, animated or not). Wherever a plugin's code gets its parameters (a material's
 * `build`, a node type's `build`, a component's `apply`, a layer's GLSL) the engine resolves such a value into a
 * three.js `Texture` first (`resolveTextures`): the code never loads a file itself.
 *
 * A **file** texture is shared by every use of the same file (counted, disposed with its last use) – change its wrap or
 * repeat once, never dispose it. A video plays muted in a loop while it is used. A **procedural** texture is drawn per
 * use: the use owns it (its `update` runs every frame, it is disposed with the node).
 */
/** What a procedural texture's `draw` gets: its parameters resolved (the spec's defaults filled in), three.js */
export interface TextureContext {
	params: Record<string, unknown>;
	/** The app's three.js (one instance – plugins never import three themselves) */
	three: typeof THREE;
}
/** What `draw` returns: the texture and, for an animated one, an `update` every frame; `dispose` frees what it made beside it */
export interface TextureInstance {
	texture: Texture;
	update?(delta: number): void;
	dispose?(): void;
}
/** Draws a procedural texture: a texture (a `CanvasTexture`, a `DataTexture`) or a `TextureInstance` */
export type TextureDraw = (context: TextureContext) => TextureInstance | Texture | null | void;
/**
 * The plugin API (version `PLUGIN_API_VERSION`, docs/plugins.md): a book's own code
 * extends the engine without touching it. A plugin module exports `register(api)` and calls the registries –
 *
 *   api.registerComponent("spin", SPEC, ({ object, params }) => ({ update: delta => { object.rotation.y += … } }))
 *   api.registerLayer("tint", SPEC, { glsl: "return mix(rgba, vec4(color, rgba.a), opacity);" })
 *   api.registerPass("halo", PASS_SPEC, ({ shaderPass }) => shaderPass(FRAGMENT))
 *   api.registerNodeType("sparkle", NODE_SPEC, ({ params, three }) => ({ object: new three.Points(…) }))
 *   api.registerMaterial("water", MATERIAL_SPEC, ({ params, time, three }) => new three.ShaderMaterial({ uniforms: { time }, … }))
 *   api.registerTexture("caustics", TEXTURE_SPEC, ({ params, three }) => ({ texture: new three.CanvasTexture(canvas), update }))
 *
 * – with the specs of `shared/types/components.ts` (a pass: `shared/types/passes.ts`, a node type:
 * `shared/types/node-types.ts`), so the editor's Entity panel, the content build and the guard read a plugin's
 * component like the built-in `animation`. A **component** runs code on a node (`applyComponents`, called by the
 * entity registry when a node is built); a **material layer** is a piece of GLSL the engine composes into the node's
 * material (`utils/layers.ts`); a **pass** is a post-processing effect over the rendered AR image
 * (`post/registry.ts`); a **node type** builds a node's own three.js object (`buildPluginNode`, called by the entity
 * registry for a type without a built-in builder – the node is placed, holds children, components and layers like
 * any); a **material** (API 1.4, `materials.ts`) replaces the material of a node's meshes (`material: { type, params }`);
 * a **procedural texture** (`textures.ts`) is drawn by code and taken by any spec's `texture` parameter. Components
 * and layers are used in the content as `components: [{ type, … }]`, a node type as `type`.
 * Across nodes and pages a plugin uses the runtime (`plugin-runtime.ts`, API 1.1): `api.events` (core events of the
 * scene, scene events of the content), `api.vars` (variables in the scopes spread / stage / session / book),
 * `api.progress` (what the reader unlocked – from the app) and `api.spread` (the current spread). A file of the book's
 * Library – a shader (`.glsl`, `.frag`, `.vert`, `.wgsl`) – comes in as text through `api.loadText(url)` (API 1.5, #186).
 *
 * Registrations are kept per plugin id: installing a plugin again (the editor's Run) replaces what it registered
 * before; an exception in `register` leaves the previous registration in place. The reader loads the plugins the
 * configuration declares (`loadPlugins`), compiled by the content build; the editor also installs modules it
 * transpiled itself (`installPlugin`) – the only place unchecked code runs.
 */
/** What a component's `apply` gets: the node, its parameters resolved, the node's objects, the target, three.js */
export interface ComponentContext {
	node: EntityData;
	/** The component's parameters with the spec's defaults filled in */
	params: Record<string, unknown>;
	/** The node's own object (a model's scene, a video's plane) – the placement group for a node without one */
	object: Object3D;
	/** The placement group around the node (its position / rotation / scale relative to the parent) */
	placed: Object3D;
	/** The placement groups of the node's children, in content order (empty for a leaf) */
	children: Object3D[];
	target: Target;
	/** The app's three.js (one instance – plugins never import three themselves) */
	three: typeof THREE;
}
/** The hooks a component returns; every one is optional */
export interface ComponentInstance {
	/** Every rendered frame while the scene runs (seconds since the last frame) */
	update?(delta: number): void;
	onFound?(): void;
	onLost?(): void;
	/** The target's first find (the app's progress decides; the scene is told through `celebrate`) */
	onUnlocked?(): void;
	/** A tap on the entity */
	onTap?(): void;
	/** The scene paused (consultation, overlays) */
	onPause?(): void;
	/** Free what the component created */
	dispose?(): void;
	/** Apply other parameter values in place (the editor's live edit); false = the node is built anew */
	tune?(params: Record<string, unknown>): boolean;
}
export type ComponentApply = (context: ComponentContext) => ComponentInstance | null | void;
/**
 * A material layer: the body of a GLSL function `vec4 (vec4 rgba, vec2 uv, float time, <the parameters>)`, run on
 * every pixel of the node's material after its own shading, in linear RGB. The spec's parameters arrive as
 * arguments in their order: number → float, boolean → float (0 / 1), color → vec3, choice → int (the index in its
 * options); string parameters are not passed. `time` is the seconds since the node was built.
 */
export interface LayerDefinition {
	glsl: string;
}
/** What a node type's `build` gets: the node, its parameters resolved, its file loaded, the target, three.js */
export interface NodeTypeContext {
	node: EntityData;
	/** The node type's parameters (from the node's `params`) with the spec's defaults filled in */
	params: Record<string, unknown>;
	/**
	 * The node's file, loaded – a model's `scene` and `animations`, a video's `element` and `texture`, an image's
	 * `texture` – or undefined (a type without `src`, or the file did not load). It is shared with every node that uses
	 * the same file: clone what you change (`asset.scene.clone()`), never dispose it.
	 */
	asset?: LoadedAsset;
	target: Target;
	/** The app's three.js (one instance – plugins never import three themselves) */
	three: typeof THREE;
}
/**
 * What a node type's `build` returns: the node's own three.js object – the engine puts it into the node's placement
 * group, next to its children – and the hooks it needs (every one optional, as a component's). When the node carries a
 * material (API 1.4) it replaces the material of every mesh of the object, except a mesh with `userData.keepMaterial =
 * true`.
 */
export interface NodeTypeInstance {
	object: Object3D;
	update?(delta: number): void;
	onFound?(): void;
	onLost?(): void;
	onUnlocked?(): void;
	onTap?(): void;
	onPause?(): void;
	/** Free what the build created (geometries, materials, textures of its own – not the shared asset) */
	dispose?(): void;
	/** Apply other parameter values in place (the editor's live edit); false = the node is built anew */
	tune?(params: Record<string, unknown>): boolean;
}
export type NodeTypeBuild = (context: NodeTypeContext) => NodeTypeInstance | null | void;
export interface PluginApi {
	/** `PLUGIN_API_VERSION` */
	readonly version: string;
	readonly three: typeof THREE;
	registerComponent(type: string, spec: ComponentSpec, apply: ComponentApply): void;
	registerLayer(type: string, spec: ComponentSpec, layer: LayerDefinition): void;
	/**
	 * A node type of the plugin's own (API 1.2): `build` makes its three.js object with `api.three` (Points, a Sprite,
	 * a Line, a mesh with its own material); the engine places it like every node – placement, children, components and
	 * layers come with it. The spec declares its parameters (rows in the Entity panel, values in the node's `params`)
	 * and the file its `src` takes (`glb`, `video`, `image` or `none`).
	 */
	registerNodeType(type: string, spec: NodeTypeSpec, build: NodeTypeBuild): void;
	/**
	 * A post-processing pass of the plugin's own: its spec as the built-in passes have it, the factory builds the
	 * three.js pass (`PassContext`: the resolved parameters, `shaderPass`, the canvas size). The content names it in
	 * `passes: [{ type, … }]`; the plugin's pass leaves the registry when the plugin is uninstalled.
	 */
	registerPass(type: string, spec: PassSpec, factory: PassFactory): void;
	/**
	 * A whole material (API 1.4): `build` makes a three.js material – a `ShaderMaterial` with GLSL of its own, a
	 * `MeshStandardMaterial` with a procedural texture – and may return `{ material, update, tune, dispose }`. A node names
	 * it as `material: { type, params }`; it replaces the material of the node's meshes (a model's, a plane's, a plugin
	 * node's), the node's layers still add on top. `time` in the context is a uniform the engine advances.
	 */
	registerMaterial(type: string, spec: MaterialSpec, build: MaterialBuild): void;
	/**
	 * A procedural texture (API 1.4): `draw` makes a three.js texture (a `CanvasTexture`, a `DataTexture`) and may
	 * return `{ texture, update, dispose }` to animate it. Any spec's `texture` parameter takes it by its type – a
	 * material's, a layer's, a component's, a node type's.
	 */
	registerTexture(type: string, spec: TextureSpec, draw: TextureDraw): void;
	/** Core events of the scene (read-only) and scene events of the content */
	readonly events: PluginEvents;
	/** Variables in the scopes spread, stage, session and book */
	readonly vars: PluginVars;
	/** The reader's progress: unlocked, consulted, completion (read-only) */
	readonly progress: PluginProgress;
	/** The current spread */
	readonly spread: PluginSpread;
	/**
	 * A text file (API 1.5): a shader of the book's Library by its URL (the Library shows it; a replace gives a new URL and
	 * rewrites it in the sources that name it), or a content path (`/assets/content/…`). One request per URL however often
	 * it is asked for; rejects on an HTTP error. A layer's GLSL is a string at register time – load files where a build
	 * runs: a material's `build`, a pass's factory, a node type's `build` (set the shader when it arrives, `needsUpdate`).
	 */
	loadText(url: string): Promise<string>;
	/** To the console, prefixed with the plugin's id */
	log(...args: unknown[]): void;
}
/** What a compiled plugin module exports */
export interface PluginModule {
	register?: (api: PluginApi) => void;
	default?: (api: PluginApi) => void;
}

export {
	EventListener$1 as EventListener,
};

export {};
