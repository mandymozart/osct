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
declare const MOMENTS: readonly [
	"reveal",
	"found",
	"lost"
];
type Moment = (typeof MOMENTS)[number];
interface AppearanceSpec extends SpecLogic {
	description: string;
	params: Record<string, ComponentParamSpec>;
}
/**
 * A parameter of a spec (a component's, a material layer's, a pass's, a light's, a plugin node type's, a material's, a
 * procedural texture's): its kind with default and range, a `description` (the editor's help) and an optional `label`
 * (schema 2.15, plugin API 1.3) – the few words the editor's row shows. Without a label the row shows the name split
 * into words (`paramLabel`). A `texture` (schema 2.17, plugin API 1.4) takes a picture: a file (a Library image or
 * video, a file of the content) or a procedural texture a plugin registers (`registerTexture`) – its value is a
 * `TextureValue` (below); the engine hands the plugin's code a three.js texture. A `model` (schema 2.28, plugin API
 * 1.7) takes a model file: a Library model's URL or a `/assets/content/…` path (in the content's YAML a `.glb` / `.gltf`
 * next to the node, which the content build resolves to its path), `""` = none – its value is that string, and the
 * plugin's code loads it with `api.loadModel(value)`.
 *
 * A number's `min` and `max` are **hard** limits: the guard and the editor refuse a value outside them, the engine keeps the
 * value it had (a warning). Schema 5.1 (#334, plugin API 3.1): its optional `slider` `[lo, hi]` is the **soft** range – the
 * span the editor's control offers first, inside min … max – and `integer: true` takes whole numbers only (min, max and
 * default whole too). The plugin API's builders (`api.p`, `./spec-builders.ts`) write these objects.
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
	slider?: readonly [
		number,
		number
	];
	integer?: boolean;
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
} | {
	kind: "model";
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
/**
 * What a spec says beyond its parameters (schema 5.1, #334, plugin API 3.1) – what the editor's Logic view draws as ports:
 * - `actions`: the rule verbs it answers on its node (`play`, `pause`, `stop`, `show`, `hide` – `SPEC_ACTIONS`): a rule's
 *   `play: <node>` reaches the component's `onAction("play")` beside the node's own clip;
 * - `events`: the scene events it emits (`ended`) – through its context's `emit`, on the bus by name;
 * - `uses`: what its code hears, emits, reads and sets of the bus and the variables, by name – the Logic view joins it to
 *   the rules (it reads the plugin's source only for a plugin that declares nothing).
 * The names are camelCase; an action is one of the node verbs, an event never a core event. An older app ignores the fields.
 */
export interface SpecLogic {
	actions?: readonly string[];
	events?: readonly string[];
	uses?: SpecUses;
}
/** A spec's bus use: event names it hears and emits, variable names it reads and sets */
export interface SpecUses {
	hears?: readonly string[];
	emits?: readonly string[];
	reads?: readonly string[];
	sets?: readonly string[];
}
export interface ComponentSpec extends SpecLogic {
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
declare const TEXTURE_SIZES: readonly [
	512,
	1024,
	2048,
	4096
];
type TextureSize = (typeof TEXTURE_SIZES)[number];
interface TextureSizeData {
	size: TextureSize;
	src: string;
}
interface TextureSetData {
	material?: string;
	/** At least one, each size once, smallest first */
	sizes: TextureSizeData[];
}
interface MediaLevelData {
	level: number;
	src: string;
}
/** Schema 5.1: `actions`, `events`, `uses` (`SpecLogic`) as a component's */
export interface PassSpec extends SpecLogic {
	description: string;
	params: Record<string, ComponentParamSpec>;
}
interface PassData {
	type: string;
	/** Optional (schema 2.22, #233): `false` switches the pass off – it keeps its place and values, the chain skips it */
	enabled?: boolean;
	[param: string]: unknown;
}
declare const NODE_SRC_KINDS: readonly [
	"none",
	"glb",
	"video",
	"image"
];
export type NodeSrcKind = (typeof NODE_SRC_KINDS)[number];
/** A node type's spec; schema 5.1 adds `actions`, `events` and `uses` (`SpecLogic`, the Logic view's ports) */
export interface NodeTypeSpec extends SpecLogic {
	description: string;
	/** The file its `src` takes (default `none`: the node has no file) */
	src?: NodeSrcKind;
	/** Its parameters, set in the node's `params` (never `position`, `rotation` or `scale` – the placement's) */
	params: Record<string, ComponentParamSpec>;
}
/** Schema 5.1: `actions`, `events`, `uses` (`SpecLogic`) as a component's */
export interface MaterialSpec extends SpecLogic {
	description: string;
	/** The node types it applies to (none = every node with meshes) – built-in types or a plugin's */
	nodeTypes?: readonly string[];
	/** Its parameters, set in the node's `material.params` */
	params: Record<string, ComponentParamSpec>;
}
export interface TextureSpec extends SpecLogic {
	description: string;
	/** Its parameters, set in a texture value `{ type, …parameters }` (a plain type takes the defaults) */
	params: Record<string, ComponentParamSpec>;
}
interface MaterialData {
	type: string;
	params?: Record<string, unknown>;
}
declare const BEHAVIOUR_SCOPES: readonly [
	"scene",
	"stage",
	"session",
	"experience"
];
type BehaviourScope = (typeof BEHAVIOUR_SCOPES)[number];
type BehaviourValue = string | number | boolean;
interface LogicCanvas {
	groups?: LogicCanvasGroup[];
	notes?: LogicCanvasNote[];
	folds?: string[];
	exposed?: Record<string, string[]>;
}
interface LogicCanvasGroup {
	id: string;
	label: string;
	members: string[];
}
interface LogicCanvasNote {
	id: string;
	text: string;
	x: number;
	y: number;
}
interface LogicData {
	/** Rules in the content's form (`./behaviour.ts`): `{ on, when?, do }` – read them with `logicRules` */
	rules: Record<string, unknown>[];
	/** Authoring data of the editor's Logic view – never in a reader's configuration */
	canvas?: LogicCanvas;
}
interface ParamTextOptions {
	description: string;
	label?: string;
}
interface NumberOptions extends ParamTextOptions {
	/** The hard limits: a value outside is refused */
	min: number;
	max: number;
	/** Default: `min` */
	default?: number;
	step?: number;
	unit?: string;
	/** The soft range `[lo, hi]` the editor's control offers, inside min … max */
	slider?: readonly [
		number,
		number
	];
}
type NumberParam = Extract<ComponentParamSpec, {
	kind: "number";
}>;
type BooleanParam = Extract<ComponentParamSpec, {
	kind: "boolean";
}>;
type StringParam = Extract<ComponentParamSpec, {
	kind: "string";
}>;
type ColorParam = Extract<ComponentParamSpec, {
	kind: "color";
}>;
type TextureParam = Extract<ComponentParamSpec, {
	kind: "texture";
}>;
type ModelParam = Extract<ComponentParamSpec, {
	kind: "model";
}>;
type ChoiceParam<O extends readonly string[]> = ParamText & {
	kind: "choice";
	options: O;
	default: O[number];
};
type FileKind = "image" | "video" | "model";
declare const PARAM_BUILDERS: {
	/** A number with hard limits `min` … `max`, an optional soft `slider` range, step and unit */
	number: (options: NumberOptions) => NumberParam;
	/** A whole number (`integer: true`, step 1 unless given): min, max and default whole too */
	integer: (options: NumberOptions) => NumberParam;
	/** True or false (default false) */
	boolean: (options: ParamTextOptions & {
		default?: boolean;
	}) => BooleanParam;
	/** A text (default "") */
	string: (options: ParamTextOptions & {
		default?: string;
	}) => StringParam;
	/** One of the options (default the first); pass them `as const` or inline, and the handler sees their union */
	choice: <const O extends readonly [
		string,
		...string[]
	]>(options: O, more: ParamTextOptions & {
		default?: O[number];
	}) => ChoiceParam<O>;
	/** A colour `#rrggbb` (default white) */
	color: (options: ParamTextOptions & {
		default?: string;
	}) => ColorParam;
	/** A picture: a Library image or video, a content file or a procedural texture (default "" = none) */
	texture: (options: ParamTextOptions & {
		default?: string;
	}) => TextureParam;
	/** A model file (default "" = none) – load it with `api.loadModel(value)` */
	model: (options: ParamTextOptions & {
		default?: string;
	}) => ModelParam;
	/** A file: `model` → a model parameter, `image` / `video` → a texture parameter */
	file: <K extends FileKind>(kind: K, options: ParamTextOptions & {
		default?: string;
	}) => K extends "model" ? ModelParam : TextureParam;
};
export type ParamBuilders = typeof PARAM_BUILDERS;
type ParamValueOf<P, Tex = unknown> = P extends {
	kind: "number";
} ? number : P extends {
	kind: "boolean";
} ? boolean : P extends {
	kind: "choice";
	options: readonly (infer O)[];
} ? (string extends O ? string : O) : P extends {
	kind: "texture";
} ? Tex : string;
/**
 * A handler's `params` for a spec: one typed field per parameter – and still indexable by any name (`params[name]` is
 * `unknown`), so code written against `Record<string, unknown>` keeps compiling. A spec typed only as `ComponentSpec` (its
 * parameter names unknown) gives `Record<string, unknown>`, as before the builders.
 */
export type ParamsOf<S, Tex = unknown> = S extends {
	params: infer P;
} ? string extends keyof P ? Record<string, unknown> : {
	-readonly [K in keyof P]: ParamValueOf<P[K], Tex>;
} & Record<string, unknown> : Record<string, unknown>;
type ItemsOf<L> = L extends readonly (infer A)[] ? A & string : never;
/** The literal union of a spec's declared `actions` (never without any) */
export type ActionsOf<S> = S extends {
	actions?: infer L;
} ? ItemsOf<L> : never;
/** The literal union of a spec's declared `events` (never without any) */
export type EventsOf<S> = S extends {
	events?: infer L;
} ? ItemsOf<L> : never;
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
interface SurfacePlace {
	x: number;
	y: number;
	z: number;
	rx: number;
	ry: number;
	rz: number;
}
interface SurfaceData {
	/** Unique within its scene; an entry names it (`EntryData.surface`), a target's place too (`TargetPlace.surface`) */
	id: string;
	/** Optional: what is printed on it (`186–187`, `Cover`) – free text, never arithmetic */
	label?: string;
	widthMm: number;
	heightMm: number;
	/** Where it lies in the scene (`SurfacePlace`) */
	place: SurfacePlace;
}
interface SceneData {
	/** Stable and invisible: links (`/scene/<id>`), progress and entries name it */
	id: string;
	/** What the reader's switcher and lists show for it – free text (`186–187`, `Cover`, `Studio wall`) */
	label: string;
	/** Optional: the id of the group the scene belongs to (`GameConfiguration.groups`) */
	group?: string;
	/** Its physical areas, in order – at least one */
	surfaces: SurfaceData[];
	/** Optional (schema 2.5): the post-processing passes over this scene's rendered image, in order; replaces the experience's (`[]` = none) */
	passes?: PassData[];
	/** Optional (schema 5.0, #334): the scene's rules – live while the scene is open (`./logic.ts`); its canvas never reaches a reader */
	logic?: LogicData;
}
interface AssetData {
	id: string;
	assetType: AssetType;
	src: string;
	/** Optional (schema 2.27), a model file only (glb / gltf): its maps in several sizes */
	textures?: TextureSetData[];
	/**
	 * Optional (schema 4.3, #331), an image, video or audio file only: the medium in several quality levels (image px,
	 * video height, audio kbps – `MEDIA_LEVELS`); `src` stays the file an older app loads
	 */
	levels?: MediaLevelData[];
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
	/** `text` nodes: the line shown; `{{entry.title}}` and `{{experience.title}}` are replaced */
	text?: string;
	/** `text` nodes: the colour, `#rrggbb` (default white) */
	color?: string;
	/** `light` nodes (schema 2.6 – `LIGHT_PARAMS`): kind, colour, intensity, …; every value optional */
	light?: LightData;
}
interface EntityRefData {
	ref: string;
}
interface TargetPlace {
	/** The surface it lies on, by id (`SurfaceData.id`) – required when the scene has several */
	surface?: string;
	x: number;
	y: number;
	width: number;
	height?: number;
}
interface TargetData {
	id: string;
	imageSrc: string;
	entity?: EntityData | EntityRefData;
	/** Optional: where it is printed (`TargetPlace`) – targets made in the editor carry it */
	place?: TargetPlace;
	/**
	 * Optional (schema 2.26): `false` = switched off (#249) – the target keeps its values and its entry in the content, the
	 * reader leaves both out (no image target, no entry in the list, not counted); none or `true` = in the experience
	 */
	enabled?: boolean;
	/**
	 * Optional (schema 4.1, #306): the image tracker's recognition data, made ahead from `imageSrc` (`osct targets prepare`)
	 * – none = the reader makes it from `imageSrc` when the scene opens. The API drops it whenever `imageSrc` changes.
	 */
	recognition?: TargetRecognitionData;
	/**
	 * Optional (schema 4.2, #306): `true` = this target always uses its printed image, even when the experience says
	 * `recognition: "prepared"` – the target keeps its `recognition`; none or `false` = the experience decides
	 */
	recognitionOff?: boolean;
}
interface TargetRecognitionData {
	/** The grey 480 × 640 frame (a Library file) */
	imageSrc: string;
	/** Width and height in px of the printed image it was made from */
	width: number;
	height: number;
}
interface EntryData {
	id: string;
	category: EntryCategory;
	title: string;
	/** The id of the entry's scene (`SceneData.id`) – where the reader finds it */
	scene: string;
	/** Optional: the id of one of its scene's `surfaces` the entry lies on – only when the scene has several */
	surface?: string;
	/**
	 * The text (schema 2.23: Markdown – paragraphs, *emphasis*, **strong**, [links](https://…) – with the experience's
	 * variables in braces, `{hasKey}`; `../text/entry-text.ts` renders it). Plain text reads as before.
	 */
	body: string;
	author?: string;
	image?: string;
	/** Optional (schema 4.3, #331), with `image` only: the picture in several sizes (longest side 512 / 1024 / 2048 px) */
	imageLevels?: MediaLevelData[];
	/** Optional (schema 2.34, #289): the line under the picture ("Image: … by …"), plain text */
	caption?: string;
	media?: string;
	tags: string[];
	target?: TargetData;
}
interface Target extends Omit<TargetData, "entity"> {
	entryId: string;
	sceneId: string;
	entity?: EntityData;
}
interface Entry extends Omit<EntryData, "target"> {
	sceneId: string;
	target?: Target;
}
interface Scene extends SceneData {
	/** Every entry of the scene, with or without target */
	entries: Entry[];
	/** In entry order */
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
 * The plugin runtime behind `api.events`, `api.vars`, `api.progress` and `api.scene`
 * (docs/plugins.md "Across nodes and pages"): what lets an experience's code reach across nodes and pages.
 *
 * - **Events** have two owners (the concept's rule): *core events* describe the experience and are emitted by the scene
 *   only (`CORE_EVENTS` – a plugin that emits one gets an error); *scene events* are the content's own, any other
 *   name, emitted and heard by plugins freely. One flat bus: every plugin on the stage hears every event.
 * - **Variables** live in a scope: `scene` while the scene is the current one, `stage` while the scene exists,
 *   `session` per app start, `experience` persisted with the reader's progress (through the app's `ProgressReader`;
 *   in memory without one). A read without a scope looks outward – scene, stage, session, experience – and the innermost
 *   definition wins. Every write emits the core event `varChanged`.
 * - **Progress** is read-only for plugins and comes from the app (`ArSceneOptions.progress`): unlocked targets,
 *   consulted entries, completion – never the app's store itself.
 * - **The scene** is the engine's own content model of the current scene.
 *
 * Listeners are kept per plugin id so that uninstalling a plugin (the editor's Run) removes them.
 *
 * The vocabulary – the scopes, the core events' names, the name pattern and the value type – is the behaviour
 * grammar's (`shared/types/behaviour.ts`): a behaviour rule and a plugin speak the same words.
 */
/** A variable's value: a JSON scalar; `null` on a write deletes the variable */
export type VarValue = BehaviourValue;
export type VarScope = BehaviourScope;
declare const AR_STATES: readonly [
	"running",
	"paused",
	"stopped"
];
export type ArStateName = (typeof AR_STATES)[number];
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
	sceneChanged: {
		sceneId: string;
		previous: string | null;
	};
	arState: {
		state: ArStateName;
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
	/** The value in `scope`, or without one the innermost definition (scene → stage → session → experience) */
	get(name: string, scope?: VarScope): VarValue | undefined;
	/** Set (or delete with `null`) a variable in a scope – `scene` by default */
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
	/** Unlocked targets of a scene (the whole experience without an id) as 0–1; a scene without targets counts as complete */
	completion(sceneId?: string): number;
	counts(sceneId?: string): {
		unlocked: number;
		targets: number;
	};
}
/** `api.scene` */
export interface PluginScene {
	/** The current scene as the engine knows it, null before the first scene */
	readonly current: Scene | null;
	get(sceneId: string): Scene | undefined;
}
/**
 * The pass registry: every post-processing type the engine can run – the built-in ones (`./bloom`, `./vignette`,
 * `./grade`, registered by `./index`) and a plugin's own, registered through the plugin API's `registerPass` with
 * the plugin as the owner. The content names passes by type (`passes: [{ type, …params }]`, `shared/types/passes.ts`) –
 * a plugin's too, where a declared plugin recorded it; `PostChain` builds them from here, in
 * the content's order, and skips one that cannot be built (logged).
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
export interface PassContext<P = Record<string, unknown>> {
	/**
	 * The pass's parameters with the spec's defaults filled in – a `texture` parameter as a three.js texture (a Library
	 * picture, a procedural texture of a plugin) or null for none
	 */
	params: P;
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
/**
 * A registered pass: three's `Pass`, optionally with `update` for new parameter values in place (the editor's live edit).
 * `render` gets the seconds since the last frame as its fourth argument (an animated grain counts its time with it). A
 * feedback buffer the factory makes (`api.feedback`) belongs to the pass: it steps while the pass runs and
 * goes with it.
 */
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
export type PassFactory<P = Record<string, unknown>> = (context: PassContext<P>) => PostPass;
/**
 * A node's material of a plugin (`api.registerMaterial`): the node's
 * `material: { type, params }` names a material a plugin registered; its `build` makes a three.js material (a
 * `ShaderMaterial` with GLSL of its own, a `MeshStandardMaterial` with a procedural texture …) and the engine puts it on
 * every mesh of the node's own object, in place of the material its type made (a model's, an image's or video's plane,
 * a plugin node's). The node's material layers then add on top (`utils/layers.ts` patches the plugin's material in
 * place – a `ShaderMaterial` takes them before `#include <colorspace_fragment>` and reads `vUv`). Texture parameters
 * arrive as three.js textures (`textures.ts`); `time` is a uniform the engine advances every frame, so a shader can use
 * it directly (`uniforms: { time }`).
 */
/** What a material's `build` gets */
export interface MaterialContext<P = Record<string, unknown>> {
	node: EntityData;
	/** The material's parameters with the spec's defaults filled in – a `texture` parameter as a three.js `Texture` (or null) */
	params: P;
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
export type MaterialBuild<P = Record<string, unknown>> = (context: MaterialContext<P>) => Material | MaterialInstance | null | void;
/**
 * Texture parameters: a spec's parameter of kind `texture` takes a file – a Library
 * image or video, a file of the content – or a procedural texture a plugin registered (`api.registerTexture`, drawn by
 * its code: a canvas or a data texture, animated or not). Wherever a plugin's code gets its parameters (a material's
 * `build`, a node type's `build`, a component's `apply`, a layer's GLSL) the engine resolves such a value into a
 * three.js `Texture` first (`resolveTextures`): the code never loads a file itself.
 *
 * A **file** texture is shared by every use of the same file (counted, disposed with its last use) – change its wrap or
 * repeat once, never dispose it. A video plays muted in a loop while it is used (unless the editor holds the scene's
 * media, `media.ts`). A **procedural** texture is drawn per
 * use: the use owns it (its `update` runs every frame, it is disposed with the node).
 */
/** What a procedural texture's `draw` gets: its parameters resolved (the spec's defaults filled in), three.js */
export interface TextureContext<P = Record<string, unknown>> {
	params: P;
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
export type TextureDraw<P = Record<string, unknown>> = (context: TextureContext<P>) => TextureInstance | Texture | null | void;
interface AppearanceContext<P = Record<string, unknown>> {
	/**
	 * The entity on its anchor – its whole node tree. Its position, rotation and scale are its placement; whatever the
	 * look sets on them is put back when the animation ends
	 */
	object: Object3D;
	/** The target's anchor: the page – x to the right, y to the top of the page, z out of it, 1 unit = the target's width */
	anchor: Object3D;
	/** The look's parameters with the spec's defaults filled in */
	params: P;
	/** What happens: the first find (`reveal`), a later one (`found`), the page is lost (`lost`) */
	moment: Moment;
	/** The app's three.js (one instance – a plugin never imports three itself) */
	three: typeof THREE;
	/**
	 * Copies of the entity's materials for this animation, on its meshes until it ends (a model's own materials are
	 * shared with every entity of the same file – never change those): set opacity, colour or a shader of your own on these
	 */
	materials(): Material[];
}
interface AppearanceRun {
	/** ms */
	duration: number;
	/**
	 * Show the entity `visible` of the way there: 0 = nothing of it, 1 = as it is. `reveal` and `found` run from 0 to 1,
	 * `lost` from 1 to 0 – a look that only says how the entity looks at `visible` covers all three
	 */
	update(visible: number): void;
	/** Free what the look created; the engine puts the placement and the materials back itself */
	dispose?(): void;
}
type AppearanceFactory<P = Record<string, unknown>> = (context: AppearanceContext<P>) => AppearanceRun;
declare const FEEDBACK_TYPES: readonly [
	"half",
	"float",
	"byte"
];
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
/** What a channel reads: the buffer's own previous frame, another buffer's current one, a texture, or nothing */
export type FeedbackChannel = "self" | Feedback | Texture | null;
export interface FeedbackOptions {
	/** Pixels across and down (1…2048) */
	width: number;
	height: number;
	/** GLSL ES 3.0 with `void main()` writing `gl_FragColor`; the prelude declares the `i…` uniforms and `vUv` */
	fragment: string;
	/** The plugin's own uniforms (`{ name: { value } }`), declared in its fragment – kept by reference, change `.value` */
	uniforms?: Record<string, {
		value: unknown;
	}>;
	/** `iChannel0…3` in order; default `["self"]` (Buffer A reading itself) */
	channels?: FeedbackChannel[];
	/** The target's precision: `half` (default), `float` or `byte`; falls back where the device cannot render into it */
	type?: FeedbackType;
	/** Sampling of the buffer's texture: `linear` (default) or `nearest` */
	filter?: "linear" | "nearest";
	/** Outside 0…1: `clamp` (default) or `repeat` */
	wrap?: "clamp" | "repeat";
}
/** The handle `api.feedback` returns */
export interface Feedback {
	/** The buffer's current frame – the last step's output; with ping-pong another texture after every step */
	readonly texture: Texture;
	/** `{ value: texture }`, kept current by every step: put it into a ShaderMaterial's uniforms and it follows */
	readonly uniform: {
		value: Texture;
	};
	/** Every uniform of the pass (the engine's `i…` and the plugin's own) */
	readonly uniforms: Record<string, {
		value: unknown;
	}>;
	readonly width: number;
	readonly height: number;
	/** The precision it got (after a fallback) */
	readonly type: FeedbackType;
	/** Steps done (`iFrame` of the next step) */
	readonly frame: number;
	/** Stop stepping by hand (it also pauses by itself while its node is hidden) */
	paused: boolean;
	/** Start again: `iFrame` and `iTime` back to 0 (the pass's own start, e.g. `if (iFrame < 10)`, runs again) */
	reset(): void;
	/** Free its render targets and its material; it never steps again */
	dispose(): void;
}
/**
 * The plugin API (version `PLUGIN_API_VERSION`, docs/plugins.md): an experience's own code
 * extends the engine without touching it. A plugin module exports `register(api)` and calls the registries –
 *
 *   api.registerComponent("spin", SPEC, ({ object, params }) => ({ update: delta => { object.rotation.y += … } }))
 *   api.registerLayer("tint", SPEC, { glsl: "return mix(rgba, vec4(color, rgba.a), opacity);" })
 *   api.registerPass("halo", PASS_SPEC, ({ shaderPass }) => shaderPass(FRAGMENT))
 *   api.registerNodeType("sparkle", NODE_SPEC, ({ params, three }) => ({ object: new three.Points(…) }))
 *   api.registerMaterial("water", MATERIAL_SPEC, ({ params, time, three }) => new three.ShaderMaterial({ uniforms: { time }, … }))
 *   api.registerTexture("caustics", TEXTURE_SPEC, ({ params, three }) => ({ texture: new three.CanvasTexture(canvas), update }))
 *   api.registerAppearance("softFade", LOOK_SPEC, ({ params, materials }) => ({ duration: params.duration, update: visible => … }))
 *
 * – with the specs of `shared/types/components.ts` (a pass: `shared/types/passes.ts`, a node type:
 * `shared/types/node-types.ts`), so the editor's Entity panel, the content build and the guard read a plugin's
 * component like the built-in `animation`. A **component** runs code on a node (`applyComponents`, called by the
 * entity registry when a node is built); a **material layer** is a piece of GLSL the engine composes into the node's
 * material (`utils/layers.ts`); a **pass** is a post-processing effect over the rendered AR image
 * (`post/registry.ts`); a **node type** builds a node's own three.js object (`buildPluginNode`, called by the entity
 * registry for a type without a built-in builder – the node is placed, holds children, components and layers like
 * any); a **material** (`materials.ts`) replaces the material of a node's meshes (`material: { type, params }`);
 * a **procedural texture** (`textures.ts`) is drawn by code and taken by any spec's `texture` parameter. Components
 * and layers are used in the content as `components: [{ type, … }]`, a node type as `type`. A **look** (`appearances.ts`)
 * is how an entity appears and disappears: the experience names it for a moment (`appearance: { reveal, found, lost }`).
 * Across nodes and pages a plugin uses the runtime (`plugin-runtime.ts`): `api.events` (core events of the
 * scene, scene events of the content), `api.vars` (variables in the scopes scene / stage / session / experience),
 * `api.progress` (what the reader unlocked – from the app) and `api.scene` (the current scene). A file of the experience's
 * Library – a shader (`.glsl`, `.frag`, `.vert`, `.wgsl`) – comes in as text through `api.loadText(url)` (#186), a
 * model the author picked in a `model` parameter through `api.loadModel(url)` (#263).
 * A **feedback buffer** (`feedback.ts`) is a fragment shader the engine runs once per frame into a render target
 * of its own (`api.feedback`), its own previous frame as `iChannel0` – a fluid on the GPU without the renderer in the
 * plugin's hands; `api.shadertoy(source)` turns a Shadertoy pass (`mainImage`) into its fragment.
 *
 * Registrations are kept per plugin id: installing a plugin again (the editor's Run) replaces what it registered
 * before; an exception in `register` leaves the previous registration in place. The reader loads the plugins the
 * configuration declares (`loadPlugins`), compiled by the content build; the editor also installs modules it
 * transpiled itself (`installPlugin`) – unchecked code. The editor runs both in its stage frame, a sandbox with an origin
 * of its own and no session (#234); its page runs no plugin code and mirrors the registry's specs
 * (`pluginRegistrySnapshot` → `mirrorPluginRegistry`).
 */
/** A spec's parameters as its handler gets them: typed from the spec (`ParamsOf`), a texture parameter as a three.js texture or null */
export type PluginParams<S> = ParamsOf<S, THREE.Texture | null>;
/**
 * What a component's `apply` gets: the node, its parameters resolved, the node's objects, the target, three.js, and `emit`.
 * `P`, `E`: the parameters and the event names its spec declares (inferred by `registerComponent`)
 */
export interface ComponentContext<P = Record<string, unknown>, E extends string = string> {
	node: EntityData;
	/** The component's parameters with the spec's defaults filled in */
	params: P;
	/** The node's own object (a model's scene, a video's plane) – the placement group for a node without one */
	object: Object3D;
	/** The placement group around the node (its position / rotation / scale relative to the parent) */
	placed: Object3D;
	/** The placement groups of the node's children, in content order (empty for a leaf) */
	children: Object3D[];
	target: Target;
	/** The app's three.js (one instance – plugins never import three themselves) */
	three: typeof THREE;
	/**
	 * Emit one of the events its spec declares (`events`) on the bus, with the target's id (and the payload's fields) – a
	 * rule hears it by name. An event the spec does not declare is not sent (a warning)
	 */
	emit(event: E, payload?: Record<string, unknown>): void;
}
/** The hooks a component returns; every one is optional. `P`, `A`: its spec's parameters and actions */
export interface ComponentInstance<P = Record<string, unknown>, A extends string = string> {
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
	tune?(params: P): boolean;
	/**
	 * A rule's verb on the node, one of the spec's `actions` (`play: door` reaches a component of the node `door` that
	 * declares `play`) – beside what the engine does itself (a model's clip, the node's visibility)
	 */
	onAction?(action: A): void;
}
export type ComponentApply<P = Record<string, unknown>, A extends string = string, E extends string = string> = (context: ComponentContext<P, E>) => ComponentInstance<P, A> | null | void;
/**
 * A material layer: the body of a GLSL function `vec4 (vec4 rgba, vec2 uv, float time, <the parameters>)`, run on
 * every pixel of the node's material after its own shading, in linear RGB. The spec's parameters arrive as
 * arguments in their order: number → float, boolean → float (0 / 1), color → vec3, choice → int (the index in its
 * options); string parameters are not passed. `time` is the seconds since the node was built.
 */
export interface LayerDefinition {
	glsl: string;
}
/** What a node type's `build` gets: the node, its parameters resolved, its file loaded, the target, three.js, `emit` */
export interface NodeTypeContext<P = Record<string, unknown>, E extends string = string> {
	node: EntityData;
	/** The node type's parameters (from the node's `params`) with the spec's defaults filled in */
	params: P;
	/**
	 * The node's file, loaded – a model's `scene` and `animations`, a video's `element` and `texture`, an image's
	 * `texture` – or undefined (a type without `src`, or the file did not load). It is shared with every node that uses
	 * the same file: clone what you change (`asset.scene.clone()`), never dispose it.
	 */
	asset?: LoadedAsset;
	target: Target;
	/** The app's three.js (one instance – plugins never import three themselves) */
	three: typeof THREE;
	/** Emit one of the events its spec declares, as a component's `emit` */
	emit(event: E, payload?: Record<string, unknown>): void;
}
/**
 * What a node type's `build` returns: the node's own three.js object – the engine puts it into the node's placement
 * group, next to its children – and the hooks it needs (every one optional, as a component's). When the node carries a
 * material it replaces the material of every mesh of the object, except a mesh with `userData.keepMaterial =
 * true`.
 */
export interface NodeTypeInstance<P = Record<string, unknown>, A extends string = string> {
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
	tune?(params: P): boolean;
	/** A rule's verb on the node, one of the spec's `actions` (as a component's) */
	onAction?(action: A): void;
}
export type NodeTypeBuild<P = Record<string, unknown>, A extends string = string, E extends string = string> = (context: NodeTypeContext<P, E>) => NodeTypeInstance<P, A> | null | void;
export interface PluginApi {
	/** `PLUGIN_API_VERSION` */
	readonly version: string;
	readonly three: typeof THREE;
	/**
	 * The parameter builders (API 3.1, `p.number({ min, max, slider? })`, `p.choice(["a", "b"])` …): they write the plain
	 * parameter objects, and the register functions infer the handler's `params` from them
	 */
	readonly p: ParamBuilders;
	/**
	 * A component: its spec (parameters, and optionally `actions`, `events`, `uses`) and `apply`, which gets the parameters
	 * typed from the spec (`params.speed: number`), `emit` for the declared events and returns hooks (`onAction` for the
	 * declared actions)
	 */
	registerComponent<const S extends ComponentSpec>(type: string, spec: S, apply: ComponentApply<PluginParams<S>, ActionsOf<S>, EventsOf<S>>): void;
	registerLayer<const S extends ComponentSpec>(type: string, spec: S, layer: LayerDefinition): void;
	/**
	 * A node type of the plugin's own: `build` makes its three.js object with `api.three` (Points, a Sprite,
	 * a Line, a mesh with its own material); the engine places it like every node – placement, children, components and
	 * layers come with it. The spec declares its parameters (rows in the Entity panel, values in the node's `params`)
	 * and the file its `src` takes (`glb`, `video`, `image` or `none`).
	 */
	registerNodeType<const S extends NodeTypeSpec>(type: string, spec: S, build: NodeTypeBuild<PluginParams<S>, ActionsOf<S>, EventsOf<S>>): void;
	/**
	 * A post-processing pass of the plugin's own: its spec as the built-in passes have it, the factory builds the
	 * three.js pass (`PassContext`: the resolved parameters, `shaderPass`, the canvas size). The content names it in
	 * `passes: [{ type, … }]`; the plugin's pass leaves the registry when the plugin is uninstalled.
	 */
	registerPass<const S extends PassSpec>(type: string, spec: S, factory: PassFactory<PluginParams<S>>): void;
	/**
	 * A whole material: `build` makes a three.js material – a `ShaderMaterial` with GLSL of its own, a
	 * `MeshStandardMaterial` with a procedural texture – and may return `{ material, update, tune, dispose }`. A node names
	 * it as `material: { type, params }`; it replaces the material of the node's meshes (a model's, a plane's, a plugin
	 * node's), the node's layers still add on top. `time` in the context is a uniform the engine advances.
	 */
	registerMaterial<const S extends MaterialSpec>(type: string, spec: S, build: MaterialBuild<PluginParams<S>>): void;
	/**
	 * A procedural texture: `draw` makes a three.js texture (a `CanvasTexture`, a `DataTexture`) and may
	 * return `{ texture, update, dispose }` to animate it. Any spec's `texture` parameter takes it by its type – a
	 * material's, a layer's, a component's, a node type's.
	 */
	registerTexture<const S extends TextureSpec>(type: string, spec: S, draw: TextureDraw<ParamsOf<S>>): void;
	/**
	 * A look of the plugin's own: how an entity appears and disappears. The factory runs once per animation with the
	 * entity, its anchor, the resolved parameters and the moment (`AppearanceContext`) and returns
	 * `{ duration, update(visible), dispose? }` – `visible` runs from 0 to 1 on `reveal` and `found`, from 1 to 0 on
	 * `lost`. The experience names it by its type in `appearance: { reveal, found, lost }`, in a built-in look's place.
	 */
	registerAppearance<const S extends AppearanceSpec>(type: string, spec: S, factory: AppearanceFactory<ParamsOf<S>>): void;
	/** Core events of the scene (read-only) and scene events of the content */
	readonly events: PluginEvents;
	/** Variables in the scopes scene, stage, session and experience */
	readonly vars: PluginVars;
	/** The reader's progress: unlocked, consulted, completion (read-only) */
	readonly progress: PluginProgress;
	/** The current scene */
	readonly scene: PluginScene;
	/**
	 * A text file: a shader of the experience's Library by its URL (the Library shows it; a replace gives a new URL and
	 * rewrites it in the sources that name it), or a content path (`/assets/content/…`). One request per URL however often
	 * it is asked for; rejects on an HTTP error. A layer's GLSL is a string at register time – load files where a build
	 * runs: a material's `build`, a pass's factory, a node type's `build` (set the shader when it arrives, `needsUpdate`).
	 */
	loadText(url: string): Promise<string>;
	/**
	 * A model file (`.glb`, `.gltf`): a model of the experience's Library by its URL, or a content path (`/assets/content/…`) –
	 * the value of a `model` parameter, which the author picks in the editor. One request per URL however often it is
	 * asked for; rejects on an HTTP error or a file that is no model. The model is shared by everyone who loads the same
	 * file: clone what you change (`model.scene.clone()`, a geometry's `clone()`), never dispose it. It loads after the
	 * build that asked for it returned – apply it when it arrives, and not at all once the node is disposed.
	 */
	loadModel(url: string): Promise<PluginModel>;
	/**
	 * A GPU feedback buffer: `fragment` runs once per frame into a render target the engine keeps (two, swapped
	 * every frame, while it reads its own previous frame – the channel `"self"`, the default `iChannel0`), before the scene
	 * renders, with `iTime`, `iTimeDelta`, `iFrame`, `iResolution` and `iChannel0…3` set. Show `texture` – or put `uniform`
	 * into a ShaderMaterial's uniforms, it follows every swap. Made in a node's build (a node type's, a component's, a
	 * material's) it belongs to the node: it pauses while the node is hidden or its page is not in view, and goes with it.
	 * Half-float targets by default, float on request – 8 bits where the device renders into neither (a warning).
	 */
	feedback(options: FeedbackOptions): Feedback;
	/**
	 * A Shadertoy pass as `feedback`'s fragment: its `mainImage(out vec4, in vec2)` source unchanged, called with
	 * Shadertoy's `fragCoord`; `iTime`, `iFrame`, `iResolution`, `iChannel0…3` are the buffer's. Throws without `mainImage`.
	 */
	shadertoy(source: string): string;
	/** To the console, prefixed with the plugin's id */
	log(...args: unknown[]): void;
}
interface PluginModel {
	scene: THREE.Group;
	animations: THREE.AnimationClip[];
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
