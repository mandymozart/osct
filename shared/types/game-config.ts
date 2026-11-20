/**
 * Game configuration contract – the shape of `game.config.json`.
 *
 * Written by the content build (`scripts/`), read by the engine (`engine/src/content/game-config.ts`), which the reader
 * and the editor load it with.
 * Defined once here (RULES #13). `*Data` = data loaded from JSON; the app maps it to its own model.
 * Runtime checks: `shared/guards/game-config.ts`.
 */

import type { EntryCategory } from "./entry";
import type { FilterData } from "./filters";
import type { ComponentData } from "./components";
import type { ExperienceAppearance } from "./appearance";
import type { EnvironmentData } from "./environment";
import type { LightData } from "./lights";
import type { TextureSetData } from "./textures";
import type { PassData } from "./passes";
import type { PluginData } from "./plugins";
import type { MaterialData } from "./materials";
import type { SubtitleData } from "./subtitles";

export * from "./filters";
export * from "./placement";
export * from "./components";
export * from "./behaviour";
export * from "./lights";
export * from "./textures";
export * from "./passes";
export * from "./appearance";
export * from "./plugins";
export * from "./node-types";
export * from "./subtitles";
export * from "./materials";

/**
 * Node types of an entity (extensible, RULES #7): what is seen – a model, a video or image plane, a line of text,
 * a light – or a `group` that only holds children. Links are entries, not entities.
 * The guard lets a node type it does not know pass (the engine renders nothing for it but keeps its children), so
 * a later type is a MINOR addition; the content build and the editor's API still refuse one – unless a plugin
 * registers it (schema 2.13, `./node-types.ts`): ENTITY_TYPES stays the built-in list.
 */
export const ENTITY_TYPES = ["group", "model", "video", "image", "text", "light"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
/** A node's type: a built-in one, or one a plugin registers (`registerNodeType`, camelCase – `./node-types.ts`) */
export type NodeType = EntityType | (string & {});

export const ASSET_TYPES = ["glb", "gltf", "video", "image", "audio"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * Content schema version `MAJOR.MINOR`: the version of this contract (shared/), the only compatibility rule
 * between content and app (RULES #10). The app version a content build was made with is information only.
 * - MAJOR: a change an older app cannot read – a new required field, a renamed or removed field, a changed
 *   type, a new enum value (asset type, category). The app refuses content of a newer MAJOR at startup and of a MAJOR
 *   before `OLDEST_READABLE_SCHEMA_MAJOR`.
 * - MINOR: an addition an older app of the same MAJOR still loads (RULES #10): what it does not know of a kind it knows
 *   is skipped with a warning (`engine/src/content/forward-compatible.ts`), never refused.
 * The history of the 1.x and 2.x MINORs is the table in docs/content.md ("Schema and app versions").
 *
 * **3.0** (#319, `agents/SCENES.md` "Schema 3.0" – the first release, no reader of 2.x was shipped): one clean model of
 * scenes. The configuration's `scenes` (was `spreads`) and `initialScene` (was `initialSpreadId`); a scene has a `label`,
 * an optional `group` and its `surfaces` (at least one, each placed in the scene – `place`); an entry names its `scene`
 * (and a `surface` when the scene has several); a target's `place` lies on a surface (was `print`). Gone: page numbers
 * everywhere (`page`, `firstPage`, `lastPage`, `print.page`), a spread's `title`, `format`, `matter` and `layout`, a
 * surface's `side`, and the configuration's `tutorial` (the onboarding of 2.24 apps).
 *
 * **4.0** (#320, `agents/REFACTOR-EXPERIENCE.md`): the experience is the top-level object – the configuration's
 * `experience` (was `book`); the printed book is optional data on it, `experience.book` (`BookData`: `author`,
 * `publisher` – these were on the top level). `sourceOfTruth` is gone: every experience adds and removes its scenes. Behaviour scope and plugin variable scope `experience`
 * (was `book`), text nodes' `{{experience.title}}` (was `{{book.title}}`); `latest.json` / `versions.json` name the
 * `experience` (was `book`).
 *
 * **4.1** (#306): a target's optional `recognition` – the image tracker's data made ahead from its printed image
 * (`osct targets prepare`); an older app ignores it and makes that data from the image itself, as before.
 * Every change in shared/ needs a bump: shared/content-schema.json locks the checksum of shared/ to this
 * version (scripts: `npm run schema:lock`, checked by a test).
 */
export const CONTENT_SCHEMA_VERSION = "4.1";
/** The oldest content schema MAJOR this contract reads – 4: no 3.x content is read (no reader of it was shipped) */
export const OLDEST_READABLE_SCHEMA_MAJOR = 4;

export interface ContentSchema {
  major: number;
  minor: number;
}

/** `"1.0"` → { major: 1, minor: 0 }; null when it is not `MAJOR.MINOR` */
export const parseContentSchema = (value: unknown): ContentSchema | null => {
  const match = typeof value === "string" ? /^(\d+)\.(\d+)$/.exec(value) : null;
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
};

export interface ConfigurationVersion {
  /** App version the content build was made with – information only, never a reason to refuse */
  version: string;
  timestamp: string; // when the content build inputs last changed
  hash?: string; // checksum of the content build inputs (the content's own version)
  /** Content schema `MAJOR.MINOR` the content was built with (`CONTENT_SCHEMA_VERSION`) */
  schema: string;
}

/**
 * The experience: the top-level object of the content – a book's companion, a wall, a room, an exhibition. Schema 4.0
 * (#320): was `book`; the print data moved into the optional `book`.
 */
export interface ExperienceData {
  id: string; // e.g. "osct" – identifies the experience (storage keys, progress, the Library folder, the editor's URL)
  title: string;
  /** Optional (schema 2.5): the post-processing passes of every scene without a list of its own (`./passes.ts`) */
  passes?: PassData[];
  /** Optional (schema 2.8; world and sky assets 2.9): the world around the reader and the onion sky (`./environment.ts`); none = the default */
  environment?: EnvironmentData;
  /** Optional (schema 2.29): the look an entity appears with on reveal, found and lost (`./appearance.ts`); none = the default look */
  appearance?: ExperienceAppearance;
  /** Optional (schema 4.0): the printed book this experience accompanies – none: not a book (a wall, a room, an exhibition) */
  book?: BookData;
}

/** The printed book an experience accompanies (schema 4.0, #320): print data only */
export interface BookData {
  author: string;
  /** Shown on the home page above "Start" (optional) */
  publisher?: string;
}

/**
 * Where a surface lies in its scene (schema 3.0) – the **scene's coordinate system**, one for the whole scene, not per
 * surface: millimetres, the origin on the table at the middle of the scene's first row of surfaces (a double page: its
 * spine), +x to the right, +y up, +z towards the reader (three.js' axes). `x`, `y`, `z` are the surface's centre;
 * unrotated (`rx`, `ry`, `rz` 0, degrees, Euler XYZ) a surface lies flat, face up, its top edge away from the reader
 * (−z) – a page on the table. A wall ahead stands up: `rx` 90, its face towards the reader.
 */
export interface SurfacePlace {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

/** The six numbers of a `SurfacePlace`, all required */
export const SURFACE_PLACE_KEYS = ["x", "y", "z", "rx", "ry", "rz"] as const;

/**
 * One physical area of a scene (schema 3.0): a double page (one surface, twice the page's width), a cover, a wall, a
 * poster. Surfaces are free areas next to each other – no left / right, no front / back.
 */
export interface SurfaceData {
  /** Unique within its scene; an entry names it (`EntryData.surface`), a target's place too (`TargetPlace.surface`) */
  id: string;
  /** Optional: what is printed on it (`186–187`, `Cover`) – free text, never arithmetic */
  label?: string;
  widthMm: number;
  heightMm: number;
  /** Where it lies in the scene (`SurfacePlace`) */
  place: SurfacePlace;
}

/** Several scenes under one label (`Front matter`, a chapter, a room) – a scene names it (`SceneData.group`) */
export interface GroupData {
  id: string;
  label: string;
}

/**
 * A scene: one step of the experience (#307, `agents/SCENES.md`) – a double page, a cover, a wall, a room. Its place in
 * the experience is its position in `GameConfiguration.scenes`; nothing derives order from a number.
 */
export interface SceneData {
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
}

export interface AssetData {
  id: string; // unique per scene, referenced by entities (`#id`)
  assetType: AssetType;
  src: string;
  /** Optional (schema 2.27), a model file only (glb / gltf): its maps in several sizes */
  textures?: TextureSetData[];
}

/**
 * An AR entity projected on a found target: a **tree of nodes** (content schema 2.0). The root node sits on the
 * target (1 unit = the target's width, origin in its centre); every node has a placement (`params`) relative to
 * its parent and may hold `children`. A 1.x entity is a tree of one node, so the app reads both.
 */
export interface EntityData {
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
  filters?: FilterData[]; // video only, applied in order (see ./filters.ts)
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

/** Reference to a shared entity in `GameConfiguration.entities`. */
export interface EntityRefData {
  ref: string;
}

/**
 * Where a target is printed (schema 3.0): its box in mm from the top left corner of a surface of its entry's scene –
 * the editor's stage lays the target there; the reader does not need it.
 */
export interface TargetPlace {
  /** The surface it lies on, by id (`SurfaceData.id`) – required when the scene has several */
  surface?: string;
  x: number;
  y: number;
  width: number;
  height?: number;
}

export interface TargetData {
  id: string; // defaults to the entry id
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
}

/**
 * A target's recognition data (#306) in the format of 8th Wall's image-target CLI, flat (`PLANAR`): the printed image in
 * a 3:4 portrait frame (landscape images turned 90° clockwise, the rest filled with the image's edge colour), grey,
 * 480 × 640 px. The frame's geometry follows from the printed image's size.
 */
export interface TargetRecognitionData {
  /** The grey 480 × 640 frame (a Library file) */
  imageSrc: string;
  /** Width and height in px of the printed image it was made from */
  width: number;
  height: number;
}

/** The target is in the experience: anything but `enabled: false` */
export const isTargetEnabled = (target: Pick<TargetData, "enabled">): boolean => target.enabled !== false;

/** The entry is in the reader's experience: no target, or a target that is switched on */
export const isEntryInExperience = (entry: Pick<EntryData, "target">): boolean => !entry.target || isTargetEnabled(entry.target);

export interface EntryData {
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
  author?: string; // texts
  image?: string;
  /** Optional (schema 2.34, #289): the line under the picture ("Image: … by …"), plain text */
  caption?: string;
  media?: string; // links: external URL
  tags: string[];
  target?: TargetData;
}

export interface GameConfiguration {
  version: ConfigurationVersion;
  experience: ExperienceData;
  /** The scene the reader starts on (`SceneData.id`) */
  initialScene: string;
  /** The experience: its scenes in order */
  scenes: readonly SceneData[];
  entries: readonly EntryData[];
  entities: Readonly<Record<string, EntityData>>; // shared entities, referenced by `EntityRefData`
  /** The experience's own code (schema 2.4, optional): compiled plugins the engine loads before the first scene */
  plugins?: readonly PluginData[];
  /**
   * Optional (schema 2.31, #257): the subtitle files of the experience's videos, per language (`./subtitles.ts`) – read from the
   * files' names by the content build and the editor's API, never filled in by hand
   */
  subtitles?: readonly SubtitleData[];
  /**
   * Optional (schema 2.33, #292): the credit line of each file the experience uses that has one (`"Book Golem by TER-JAN /
   * DeviantArt"`), keyed by the file's path or URL exactly as the configuration names it – written in the editor's
   * Library, filled in by the editor's API when it assembles the experience, never by hand. The reader lists them per scene
   * on its image credits page
   */
  credits?: Readonly<Record<string, string>>;
  /** Optional: the groups scenes name (`SceneData.group`) – a label over several scenes */
  groups?: readonly GroupData[];
}
