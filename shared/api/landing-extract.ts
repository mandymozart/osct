/**
 * The landing's hero, extracted from an experience (#355): one target with AR content (a model, a video, a component)
 * on one surface of one scene – the
 * experience's pick (`experience.landing`, content schema 6.1) or, without one, the default the landing always took.
 * Pure: types and shared/ only (no runtime import of the contract), no reader, no engine runtime – the editor (when the person picks), the content build,
 * the MCP server and the reader's fallback (`client/src/landing/derive.ts`) all run this one derivation, so publish and
 * the reader never traverse the scenes for it.
 *
 * Units of the hero: the surface's width is 1, its centre the origin, x → right, y → the top of the page (as the
 * engine's placement, `shared/types/placement.ts`). Paths are copied as the source names them (content paths in a
 * configuration, URLs in the engine's loaded scenes); the print layout's pictures as `LandingLayout.url` makes them.
 *
 * Not content: outside the content schema lock like the rest of shared/api/ (RULES #10) – the stored result's shape is
 * the contract's (`shared/types/landing.ts`), the way it is made is the instance's.
 */
import type { ExperienceAppearance } from "../types/appearance";
import type { AssetData, EntityData, EntityRefData, ExperienceData, GameConfiguration, SurfaceData, TargetPlace } from "../types/game-config";
import type { ExperienceLanding, LandingHeroData, LandingPick, LandingPrintData } from "../types/landing";
import type { PluginData } from "../types/plugins";
import { LANDING_FALLBACK_ENTRIES, LANDING_FORMAT, type LandingFile, seededPick } from "./landing";

/** A target as the extractor reads it: the engine's `Target` (entity resolved) or one made from a configuration's entry */
export interface LandingTarget {
  id: string;
  /** Its entry's id (the fallback's `LANDING_CONFIG.scanEntries` name entries) */
  entryId?: string;
  imageSrc: string;
  place?: TargetPlace;
  entity?: EntityData;
  enabled?: boolean;
}

/** A scene as the extractor reads it: the engine's `Scene`, or one made from a configuration (`landingSourceOf`) */
export interface LandingScene {
  id: string;
  label: string;
  surfaces: readonly SurfaceData[];
  /** In entry order */
  targets: readonly LandingTarget[];
}

/** What the hero is made of: the scenes in order, the experience's plugins and its looks */
export interface LandingSource {
  scenes: readonly LandingScene[];
  plugins?: readonly PluginData[];
  appearance?: ExperienceAppearance;
}

/** A sheet of the print layout (`layout/layout.json`, written by the delivery's layout step): a page, a spread or a cover */
export interface LayoutSheet {
  id?: string;
  /** `cover-front`, `cover-back`, … */
  kind?: string;
  /** The printed page numbers on it (none for covers) */
  pages?: number[];
  /** Below `layout/` */
  image?: string;
  widthMm?: number;
  heightMm?: number;
}

/** The print layout's folder in the content and the file that lists its sheets */
export const LAYOUT_PATH = "/assets/content/layout/";
export const LAYOUT_FILE = `${LAYOUT_PATH}layout.json`;

/** The print layout as the extractor reads it: its sheets in print order, and how a sheet's image is named (default: its content path) */
export interface LandingLayout {
  sheets: readonly LayoutSheet[];
  /** A sheet's `image` (below `layout/`) as the hero names it; none: `/assets/content/layout/<image>` */
  url?: (image: string) => string;
}

/** The hero's turning pages: the spreads before the hero's (nearest last) */
const EARLIER_SPREADS = 3;
/** Other printed images the hero's turning pages show, and the seed of their stable pick */
const PAGE_IMAGES = 6;
const PAGE_IMAGES_SEED = 354;
/** A surface for scenes without one that knows its size: a double page of the book (mm) */
const FALLBACK_SURFACE = { id: "", widthMm: 460, heightMm: 320 };
/** A target without `place` (made outside the editor): in the middle of the paper, this wide */
const UNPLACED_WIDTH = 0.6;

const isModelAsset = (asset: AssetData): boolean => asset.assetType === "glb" || asset.assetType === "gltf";

/** Every node of an entity's tree, the root first */
const nodesOf = (entity: EntityData): EntityData[] => [entity, ...(entity.children ?? []).flatMap(nodesOf)];

/** A node the engine draws something for: any type but an empty `group` or a `light` – or one a component drives */
const drawsSomething = (node: EntityData): boolean => (node.type !== "group" && node.type !== "light") || !!node.components?.length;

/**
 * The hero needs AR content – Tilman, 2026-11-23: "or video or component. marginalia and links wouldnt work": the
 * target's entity draws something the engine builds for a found target – a model, a video (keyed or not), an image, a
 * text, a plugin's node type, or a node a component drives. An entry without an entity (marginalia, texts, links) cannot.
 */
export const hasLandingContent = (entity: EntityData | undefined | null): entity is EntityData =>
  !!entity && typeof entity.type === "string" && nodesOf(entity).some(drawsSomething);

/** The entity holds a glTF model somewhere in its tree – the default's first choice */
const hasModel = (entity: EntityData | undefined): boolean =>
  !!entity && nodesOf(entity).some(node => node.type === "model" && (node.assets ?? []).some(isModelAsset));
/** The entity holds a video somewhere in its tree – the default's choice without a model */
const hasVideo = (entity: EntityData | undefined): boolean =>
  !!entity && nodesOf(entity).some(node => node.type === "video" && (node.assets ?? []).some(asset => asset.assetType === "video"));

/** Why a target cannot be the hero, for a disabled menu item or a problem; null when it can */
export const landingContentProblem = (entity: EntityData | undefined | null): string | null =>
  hasLandingContent(entity) ? null : "It has no AR content – the landing's hero shows a target's model, video or component on its print (marginalia and links cannot).";

/**
 * A configuration's scenes as the extractor reads them: each scene's targets in entry order, switched-off targets left
 * out (the reader leaves them out too), shared entities resolved (`{ ref }`)
 */
export const landingSourceOf = (config: Pick<GameConfiguration, "experience" | "scenes" | "entries" | "entities" | "plugins">): LandingSource => {
  const resolve = (entity: EntityData | EntityRefData | undefined): EntityData | undefined =>
    entity && "ref" in entity ? config.entities?.[entity.ref] : entity;
  const scenes = (config.scenes ?? []).map(scene => ({
    id: scene.id,
    label: scene.label,
    surfaces: scene.surfaces ?? [],
    targets: (config.entries ?? []).flatMap(entry => (entry.scene === scene.id && entry.target && entry.target.enabled !== false
      ? [{ id: entry.target.id ?? entry.id, entryId: entry.id, imageSrc: entry.target.imageSrc, place: entry.target.place, entity: resolve(entry.target.entity) }]
      : [])),
  }));
  return {
    scenes,
    ...(config.plugins?.length ? { plugins: config.plugins } : {}),
    ...(config.experience?.appearance ? { appearance: config.experience.appearance } : {}),
  };
};

const shown = (scene: LandingScene): LandingTarget[] => scene.targets.filter(target => target.enabled !== false);

/** The scene and target a pick names, or why there is none (an unknown scene or target, a target without AR content) */
export const findLandingPick = (source: LandingSource, pick: LandingPick): { scene: LandingScene; target: LandingTarget } | { problem: string } => {
  const scene = source.scenes.find(s => s.id === pick.scene);
  if (!scene) return { problem: `no scene "${pick.scene}"` };
  const target = scene.targets.find(t => t.id === pick.target);
  if (!target) return { problem: `no target "${pick.target}" on the scene "${pick.scene}"` };
  if (target.enabled === false) return { problem: `the target "${pick.target}" is switched off` };
  const problem = landingContentProblem(target.entity);
  return problem ? { problem: `the target "${pick.target}": ${problem}` } : { scene, target };
};

/** Why a pick cannot be the hero (an unknown scene or target, a target without AR content), null when it can */
export const landingPickProblem = (source: LandingSource, pick: LandingPick): string | null => {
  const found = findLandingPick(source, pick);
  return "problem" in found ? found.problem : null;
};

/**
 * The fallback's pick – what the landing showed before an experience had one: the first of `entryIds` (entries or
 * targets) that has a model, else the first target with a model in scene order, else the first with a video; null when
 * the content has neither
 */
export const defaultLandingPick = (source: LandingSource, entryIds: readonly string[] = LANDING_FALLBACK_ENTRIES): LandingPick | null => {
  const targets = source.scenes.flatMap(scene => shown(scene).map(target => ({ scene, target })));
  const chosen = entryIds.map(id => targets.find(({ target }) => target.entryId === id || target.id === id))
    .find(found => found && hasModel(found.target.entity))
    ?? targets.find(({ target }) => hasModel(target.entity))
    ?? targets.find(({ target }) => hasVideo(target.entity));
  return chosen ? { scene: chosen.scene.id, target: chosen.target.id } : null;
};

/** The surface a target lies on: its place's, else the scene's first, else a double page */
const surfaceOf = (target: LandingTarget, scene: LandingScene): Pick<SurfaceData, "widthMm" | "heightMm"> & { id: string; label?: string } =>
  scene.surfaces.find(s => s.id === target.place?.surface) ?? scene.surfaces[0] ?? FALLBACK_SURFACE;

/** A target's print on its surface – unplaced: in the middle */
const printOf = (target: LandingTarget, scene: LandingScene): LandingPrintData => {
  const place = target.place;
  if (!place) return { src: target.imageSrc, x: 0, top: null, width: UNPLACED_WIDTH };
  const surface = surfaceOf(target, scene);
  const unit = surface.widthMm;
  return {
    src: target.imageSrc,
    x: (place.x + place.width / 2) / unit - 0.5,
    top: surface.heightMm / unit / 2 - place.y / unit, // mm down from the top edge → up from the centre
    width: place.width / unit,
    ...(place.height !== undefined ? { height: place.height / unit } : {}),
  };
};

/** The core of the hero: the surface, its prints and the target's entity – what the scene alone decides */
export type LandingStage = Pick<LandingHeroData, "aspect" | "pages" | "prints" | "target" | "entity">;

/**
 * The hero's stage of a scene and one of its targets with AR content: the surface the target lies on (its place's,
 * else the scene's first), every placed target on that surface as a print (unplaced: only the target's own, in the
 * middle), the page numbers in the surface's label (else the scene's – `10–11` → [10, 11]), the target's entity as
 * the configuration has it (its node tree, components and files – the engine builds it on the hero as in the reader)
 */
export const landingStage = (scene: LandingScene, target: LandingTarget): LandingStage | null => {
  const entity = target.entity;
  if (!hasLandingContent(entity)) return null;
  const surface = surfaceOf(target, scene);
  const own = printOf(target, scene);
  const onSurface = (t: LandingTarget) => (t.place!.surface ?? scene.surfaces[0]?.id) === (target.place!.surface ?? scene.surfaces[0]?.id);
  const prints = target.place ? shown(scene).filter(t => t.place && onSurface(t)).map(t => printOf(t, scene)) : [own];
  const label = surface.label || scene.label || "";
  const pages = (label.match(/\d+/g) ?? []).map(Number);
  return { aspect: surface.heightMm / surface.widthMm, pages, prints, target: own, entity };
};

const layoutUrl = (layout: LandingLayout | undefined, sheet: LayoutSheet): string | null =>
  sheet.image ? (layout?.url ?? (image => `${LAYOUT_PATH}${image}`))(sheet.image) : null;

/**
 * The sheet that shows these pages and the spreads before it in print order (`before` of them, nearest last) – the
 * landing's book opens through them onto the hero's scene (#354); null when no sheet has the pages
 */
export const spreadSheets = (sheets: readonly LayoutSheet[], pages: readonly number[], before: number): { spread: LayoutSheet; earlier: LayoutSheet[] } | null => {
  if (!pages.length) return null;
  const index = sheets.findIndex(sheet => sheet.image && pages.every(page => sheet.pages?.includes(page)));
  if (index < 0) return null;
  const earlier = sheets.slice(0, index).filter(sheet => sheet.image && (sheet.pages?.length ?? 0) >= 2).slice(-before);
  return { spread: sheets[index], earlier };
};

/** The print layout's front cover (`cover-front`) as the layout names it; null without a layout or a cover sheet */
export const landingCover = (layout: LandingLayout | undefined): string | null => {
  const sheet = layout?.sheets.find(s => s.kind === "cover-front");
  return sheet ? layoutUrl(layout, sheet) : null;
};

/** The experience's target images in scene order – the hero's drifting pictures */
export const landingImages = (source: LandingSource): string[] => source.scenes.flatMap(scene => shown(scene).map(target => target.imageSrc));

/** A plugin as the hero loads it: what the engine reads (`registered` is the content build's record, not needed here) */
const heroPlugin = (plugin: PluginData): PluginData => ({ id: plugin.id, src: plugin.src, api: plugin.api });

/**
 * The hero of a pick: its stage, the layout's picture of its surface and of the spreads before it, other printed images
 * for the turning pages, the experience's plugins and looks. null when the pick names no scene or target, or the target
 * has no AR content (`landingPickProblem` says why).
 */
export const extractLandingHero = (source: LandingSource, pick: LandingPick, layout?: LandingLayout): LandingHeroData | null => {
  const found = findLandingPick(source, pick);
  if ("problem" in found) return null;
  const stage = landingStage(found.scene, found.target);
  if (!stage) return null;
  const sheets = spreadSheets(layout?.sheets ?? [], stage.pages, EARLIER_SPREADS);
  const prints = new Set(stage.prints.map(print => print.src));
  return {
    ...stage,
    spread: sheets ? layoutUrl(layout, sheets.spread) : null,
    earlier: (sheets?.earlier ?? []).map(sheet => layoutUrl(layout, sheet)).filter((src): src is string => !!src),
    pageImages: seededPick(landingImages(source).filter(src => !prints.has(src)), PAGE_IMAGES, PAGE_IMAGES_SEED),
    plugins: (source.plugins ?? []).map(heroPlugin),
    ...(source.appearance ? { appearance: source.appearance } : {}),
  };
};

/** The pick with its extracted hero and the layout's cover, as `experience.landing` stores it; null when it cannot be the hero */
export const extractExperienceLanding = (source: LandingSource, pick: LandingPick, layout?: LandingLayout): ExperienceLanding | null => {
  const hero = extractLandingHero(source, pick, layout);
  if (!hero) return null;
  const cover = landingCover(layout);
  return { scene: pick.scene, target: pick.target, hero, ...(cover ? { cover } : {}) };
};

/** A content file's address as a content path: `<any base>/assets/content/…` → `/assets/content/…` */
const CONTENT_ADDRESS = /^[a-z][a-z0-9+.-]*:\/\/[^?#]*?(\/assets\/content\/.*)$/i;

/**
 * JSON with the keys of every object sorted and every content file's address as its content path: two values that
 * differ only in key order, or in where their files are read from, compare equal – the draft endpoint hands the stored
 * pick out with its paths resolved below the assets base (RULES #36), a fresh extraction stores content paths
 */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => typeof item === "string"
    ? item.replace(CONTENT_ADDRESS, "$1")
    : item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)))
      : item);

/**
 * The stored landing is out of date: what the experience holds now (`fresh`, extracted again from the draft) differs
 * from what was stored – another model, a moved print, a new plugin, another cover. A stored pick without a hero, or a
 * pick that cannot be the hero any more (`fresh` null), is out of date too.
 */
export const landingHeroStale = (stored: ExperienceLanding | null | undefined, fresh: ExperienceLanding | null): boolean => {
  if (!stored) return false;
  if (!fresh || !stored.hero) return true;
  return canonical({ hero: stored.hero, cover: stored.cover ?? null }) !== canonical({ hero: fresh.hero, cover: fresh.cover ?? null });
};

/**
 * The configuration with its pick's hero filled in (`experience.landing.hero` and `cover`) – the content build's step
 * after the media got their final names; a configuration without a pick, or whose pick cannot be the hero, is returned
 * as it is (the build reports the pick's problem before)
 */
export const withLandingHero = <C extends Pick<GameConfiguration, "experience" | "scenes" | "entries" | "entities" | "plugins">>(config: C, layout?: LandingLayout): C => {
  const pick = config.experience.landing;
  if (!pick) return config;
  const landing = extractExperienceLanding(landingSourceOf(config), { scene: pick.scene, target: pick.target }, layout);
  if (!landing) return config;
  const experience: ExperienceData = { ...config.experience, landing };
  return { ...config, experience };
};

/**
 * The `landing.json` of a configuration (shared/api/landing.ts): its experience's texts, its target images, the
 * layout's cover and the hero – the stored one (`experience.landing.hero`), else extracted from its pick, else from
 * the default the landing always took (`fallbackEntries`: `LANDING_CONFIG.scanEntries`); hero null without a model or video
 */
export const landingFileOf = (config: GameConfiguration, layout?: LandingLayout, fallbackEntries: readonly string[] = LANDING_FALLBACK_ENTRIES): LandingFile => {
  const source = landingSourceOf(config);
  const { experience } = config;
  const stored = experience.landing;
  const pick = stored ? { scene: stored.scene, target: stored.target } : defaultLandingPick(source, fallbackEntries);
  const hero = stored?.hero ?? (pick ? extractLandingHero(source, pick, layout) : null);
  return {
    format: LANDING_FORMAT,
    schema: config.version.schema,
    experience: experience.id,
    title: experience.title,
    author: experience.book?.author ?? "",
    publisher: experience.book?.publisher ?? "",
    images: landingImages(source),
    cover: stored?.cover ?? landingCover(layout),
    hero,
  };
};
