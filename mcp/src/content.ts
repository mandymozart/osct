// The editor's content tools over the API (`/api/editor/*`, docs/server.md "Editor data", "Assets"): the experience's tree
// and scenes (content schema 3.0), entities and targets, entries, the scenes themselves and their groups, the experience's
// passes, appearance and environment, assets, the draft, publishing to the instance's own environment, the logs, the
// migration of a 2.x experience to 3.0. Every write is checked against the shared content contract first and answers with the
// editor's link, where the person checks the draft on the stage. Production stays with the person – the tool refuses it.
// Re-importing an experience and removing a scene or an entry take the API's two steps: the comparison or the impact, which the
// person sees, then the import or the removal with its confirmation; plans (a move, a group, the migration) the same way.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { ApiError, type OsctApi } from "./api.ts";
import { checkAppearance, checkEntity, checkPasses, describeContentModel, usesPluginAppearances, usesPluginPasses, usesPluginTypes, type ExperienceModel } from "./model.ts";
import { fail, guard, text, type Result } from "./result.ts";
import { editSurfaces, SURFACE_SIZE_PRESETS } from "./surfaces.ts";
import { editorHref, type AppLinks } from "./services.ts";
import { slugProblem } from "../../shared/api/experience-paths";
import type { PluginData } from "../../shared/types/game-config";
import { APPEARANCE_TYPES, CARD_LOOK_TYPES, MOMENTS, PASS_TYPES, RECOGNITION_MODES } from "../../shared/types/game-config";
import { MEDIA_LEVELS } from "../../shared/types/media-levels";
import { pluginText } from "../../shared/types/plugins";
import { logicProblems } from "../../shared/types/logic";
import { EntryCategory } from "../../shared/types/entry";
import { ENVIRONMENT_WORLDS, environmentProblems } from "../../shared/types/environment";
import { exprMessage, renderEntryText } from "../../shared/text/entry-text";
import { extractDraftLanding } from "../../shared/api/landing-draft";
import { isReservedSceneId, RESERVED_SCENE_IDS } from "../../shared/api/names";
import type { GameConfiguration } from "../../shared/types/game-config";
import type {
  AssetCreditsSaved,
  AssetList,
  AssetNamesPlan,
  AssetRenamed,
  AssetUploaded,
  Change,
  DraftManifest,
  EntitySaved,
  EntryAdded,
  EntryList,
  EntrySaved,
  EnvironmentSaved,
  EnvironmentsInfo,
  GroupPlanned,
  GroupSaved,
  PluginSource,
  PluginSummary,
  PublishedVersion,
  RemovalResult,
  SceneAdded,
  SceneList,
  SceneSaved,
  ScenesMoved,
  RevertResult,
  SurfaceReferenceSaved,
  SharedEntities,
  TargetSaved,
  Ungrouped,
} from "../../shared/api/editor";
import type {
  ExperienceAppearanceSaved,
  ExperienceList,
  ExperiencePassesSaved,
  ExperienceSaved,
  ExperienceTree,
  ExperienceUpdate,
  ImportComparison,
  ImportPreview,
  ImportResult,
  PublishJob,
  PublishStarted,
  RemovalImpact,
} from "../../shared/api/editor";
import { confirmationStep } from "../../shared/api/errors";
import { CREDITS_BATCH_MAX, CREDITS_MAX, SCENE_PAGE_MM, SCENE_PRESETS, SCENE_SURFACES_MAX, SCENE_WALL_MM, SURFACE_REFERENCE_FITS } from "../../shared/api/editor";
import { IMAGE_FITS, IMAGE_MAX_SIDE, IMAGE_WEBP_QUALITY, imageUseQuery, type ImageFit } from "../../shared/api/images";
import {
  ASSET_KINDS,
  BODY_MAX_LENGTH,
  ENTRY_TAGS,
  ENV_NAME,
  ID_PATTERN,
  isLinkUrl,
  pluginTypes,
  TEXT_MAX_LENGTH,
} from "../../shared/api/rules";

type Json = Record<string, unknown>;

/**
 * An entry's body as the reader would render it: a construct that does not parse (a brace not closed, a list, a
 * function) is refused before it is sent – the reader would show nothing in its place. A variable that is not set is no
 * problem here: the values come while reading.
 */
export function checkEntryText(body: string): Result | null {
  const problems = renderEntryText(body).problems.filter(p => p.severity === "error");
  if (!problems.length) return null;
  return fail({
    error: { code: "invalid-entry-text", message: "The body's braces do not parse (nothing was sent).", problems: problems.map(p => `at ${p.start}: ${exprMessage(p)}`) },
    hint: "Variables are {name} or {condition: text|else text}; write \\{ for a brace. describe_content_model entryText has the syntax.",
  });
}

/** The warnings for an answer: what in the body the reader skips (a stray brace) */
export function textWarnings(body: string | undefined): { warnings?: string[] } {
  if (body === undefined) return {};
  const warnings = renderEntryText(body).problems.filter(p => p.severity === "warning" && p.code !== "missing-value").map(p => `body at ${p.start}: ${exprMessage(p)}`);
  return warnings.length ? { warnings } : {};
}

/**
 * The import's first step (409 confirm-import) or a void confirmation (409 confirmation-void) as the tool's answer:
 * nothing was imported – the comparison to show the person and the confirmation to send back with their yes. Other
 * errors: null.
 */
export function importStep(error: unknown): Json | null {
  const step = error instanceof ApiError ? confirmationStep<ImportComparison>(error, "import") : null;
  if (!step) return null;
  return {
    imported: false,
    ...(step.changed ? { void: (error as ApiError).message } : {}),
    comparison: step.shows,
    confirmation: step.confirmation,
    next: "Nothing was imported. Show the person the comparison – the incoming build against what the draft is based on and its edits since – and ask. Only with their yes call import_experience again with the same arguments and confirm: confirmation.id (it expires, and any change meanwhile voids it).",
  };
}

/**
 * A removal's first step (409 confirm-delete) or a void confirmation (409 confirmation-void) as the tool's answer:
 * nothing was removed – the impact to show the person and the confirmation to send back with their yes. Other errors:
 * null.
 */
export function deleteStep(error: unknown, tool: "delete_scene" | "delete_entry"): Json | null {
  const step = error instanceof ApiError ? confirmationStep<RemovalImpact>(error, "removal") : null;
  if (!step) return null;
  return {
    deleted: false,
    ...(step.changed ? { void: (error as ApiError).message } : {}),
    impact: step.shows,
    confirmation: step.confirmation,
    next: `Nothing was removed. Show the person the impact – the entries, targets and entities that go, the shared entities that are kept, and the Library files used only here and elsewhere – and ask. Only with their yes call ${tool} again with the same arguments and confirm: confirmation.id; add deleteFiles: true only if they asked for the files used only here to be deleted too (files used elsewhere are never deleted). The id expires, and any change in the experience meanwhile voids it.`,
  };
}

const ID = z.string().regex(ID_PATTERN, "letters, digits, _ and -, at most 64");
const EXPERIENCE = ID.describe("the experience's id (list_experiences)");
const entitySchema = z.record(z.string(), z.unknown()).describe("EntityData – the node tree (describe_content_model)");
const targetPlaceSchema = z
  .object({
    surface: ID.optional().describe("the surface of the entry's scene it lies on, by id (list_scenes) – required when the scene has several"),
    x: z.number().describe("mm from the surface's left edge"),
    y: z.number().describe("mm from the surface's top edge"),
    width: z.number().positive().describe("the printed width in mm"),
    height: z.number().positive().optional().describe("the printed height in mm (default: from the image's proportions)"),
  })
  .strict()
  .describe("where the target lies (TargetPlace): its box in mm from the top left corner of a surface of its entry's scene");

const read = { readOnlyHint: true, openWorldHint: false };

/** How long publish and publish_status follow a running publish job (#345), and how often they poll it (tests shorten it) */
export const PUBLISH_TIMING = { waitMs: 90_000, pollMs: 2_000 };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const passSchema = z.object({ type: z.string().min(1), enabled: z.boolean().optional() }).catchall(z.union([z.number(), z.string(), z.boolean()]))
  .describe("a pass: { type, enabled?, …parameters } – enabled: false switches it off, keeping its values (describe_content_model passes)");
const passesSchema = z.array(passSchema);

/**
 * The contract's verdict over a passes list (the built-in types and the experience's plugins' passes, every
 * parameter in range) as a tool error, else the warnings for the answer. The experience's plugins are read only when the list
 * names a type that is not built in.
 */
async function checkPassWrite(passes: unknown, path: string, experience: () => Promise<ExperienceModel>): Promise<{ refused: Result | null; warnings: { warnings?: string[] } }> {
  const { problems, unverified } = checkPasses(passes, path, usesPluginPasses(passes) ? await experience() : undefined);
  if (problems.length) {
    return {
      refused: fail({
        error: { code: "invalid-passes", message: `${path} does not match the content contract (nothing was sent).`, problems },
        hint: `describe_content_model { experience } lists the passes (${PASS_TYPES.join(", ")} and the experience's plugins') with their parameters.`,
      }),
      warnings: {},
    };
  }
  return {
    refused: null,
    warnings: unverified.length ? { warnings: [`passes no recorded plugin provides: ${unverified.join(", ")} – a compiled plugin of the experience must register them, else the publish is refused (unknown-passes)`] } : {},
  };
}

const lookSchema = z.object({ type: z.string().min(1) }).catchall(z.union([z.number(), z.string(), z.boolean()]))
  .describe("a look: { type, …parameters } – only the values that differ from the look's defaults (describe_content_model appearance)");
const appearanceSchema = z.object({
  ...(Object.fromEntries(MOMENTS.map(moment => [moment, lookSchema.optional()])) as Record<(typeof MOMENTS)[number], z.ZodOptional<typeof lookSchema>>),
  // The card look (content schema 6.3, #361): how the marginalia card is picked up
  card: lookSchema.optional(),
}).strict();

/**
 * Checks an entity against the content contract before it is sent: the guard's verdict as a tool error (`refused`),
 * else the warnings for the answer. The experience's plugins are read only when the tree names a type that is not built in.
 */
async function checkWrite(entity: unknown, path: string, experience: () => Promise<ExperienceModel>): Promise<{ refused: Result | null; warnings: { warnings?: string[] } }> {
  const check = checkEntity(entity, path, usesPluginTypes(entity) ? await experience() : undefined);
  if (check.problems.length) {
    return {
      refused: fail({
        error: { code: "invalid-entity", message: `${path} does not match the content contract (nothing was sent).`, problems: check.problems },
        hint: "describe_content_model { experience } lists the node types, placement, filters and components – the experience's plugins' too.",
      }),
      warnings: {},
    };
  }
  const warnings = [
    ...(check.unknownComponents.length ? [`component types no built-in or known plugin provides: ${check.unknownComponents.join(", ")} – a plugin must register them, else the publish is refused`] : []),
    ...(check.unverifiedNodeTypes.length ? [`node types no known plugin registers: ${check.unverifiedNodeTypes.join(", ")} – a plugin of the experience whose types are not recorded must register them, else the publish is refused`] : []),
    ...(check.unknownMaterials.length ? [`materials no known plugin registers: ${check.unknownMaterials.join(", ")} – a plugin of the experience must register them, else the publish is refused`] : []),
  ];
  return { refused: null, warnings: warnings.length ? { warnings } : {} };
}

export function registerContentTools(server: McpServer, api: OsctApi, links: AppLinks): void {
  const tree = (experience: string) => api.call<ExperienceTree>("GET", `/editor/experiences/${encodeURIComponent(experience)}`);
  const entities = (experience: string) => api.call<SharedEntities>("GET", `/editor/experiences/${encodeURIComponent(experience)}/entities`);
  const draft = async (experience: string) => {
    const manifest = await api.call<DraftManifest>("GET", `/editor/experiences/${encodeURIComponent(experience)}/draft/latest.json`);
    const configuration = await api.call<Json & { plugins?: PluginData[] }>("GET", `/editor/experiences/${encodeURIComponent(experience)}/draft/${manifest.build}/game.config.json`);
    return { manifest, configuration };
  };
  /** the scene a target's entry lies on – for the link of a target write */
  const sceneOf = (t: ExperienceTree, targetId: string) => t.scenes.find(s => s.entries.some(e => e.target?.id === targetId))?.id ?? null;
  /** the experience's plugins: the declared ones with what they recorded (the draft), the Code tab's sources with the types read from them */
  const experienceModel = async (experience: string): Promise<ExperienceModel> => {
    const [{ configuration }, { plugins }] = await Promise.all([draft(experience), api.call<{ plugins: PluginSummary[] }>("GET", `/editor/experiences/${encodeURIComponent(experience)}/plugins`)]);
    const sources = await Promise.all(
      plugins.map(async p => {
        const { plugin } = await api.call<{ plugin: PluginSource }>("GET", `/editor/experiences/${encodeURIComponent(experience)}/plugins/${encodeURIComponent(p.id)}`);
        return { id: plugin.id, ...pluginTypes(pluginText(plugin.files)) };
      }),
    );
    return { declared: configuration.plugins ?? [], sources };
  };
  /**
   * A removal (scene or entry) in the API's two steps: without `confirm` the impact and a confirmation (nothing
   * removed); with it the removal – `deleteFiles` only with `confirm`
   */
  const removeStep = async (tool: "delete_scene" | "delete_entry", experience: string, path: string, confirm?: string, deleteFiles?: boolean): Promise<Result> => {
    if (deleteFiles && !confirm) return fail({ error: { code: "mcp", message: "deleteFiles goes with confirm – first show the person the impact" } });
    try {
      const result = await api.call<RemovalResult>("DELETE", path, confirm ? { confirm, ...(deleteFiles ? { deleteFiles: true } : {}) } : undefined);
      return text({ ...result, open: editorHref(links, experience) });
    } catch (error) {
      const step = deleteStep(error, tool);
      if (!step) throw error;
      return text({ ...step, open: editorHref(links, experience) });
    }
  };

  // ── reading ──

  server.registerTool(
    "list_experiences",
    { description: "The instance's experiences: id, title, author, the scene it opens on (initialScene), number of scenes, content schema, last publish, `live` (the environments serving a build of it – every experience has its own store in each; empty: draft only) – and the editor's link of each; `environments` = the environments whose content store could not be read (where an experience is live there is unknown).", inputSchema: z.object({}), annotations: read },
    guard(async () => {
      const { experiences, environments } = await api.call<ExperienceList>("GET", "/editor/experiences");
      return text({ experiences: experiences.map(b => ({ ...b, open: editorHref(links, b.id) })), environments });
    }),
  );

  /** import_experience's and preview_import's body: the CDN, a configuration fetched from `url`, or the one given */
  const importSource = async ({ url, configuration, assetsBase, source }: { url?: string; configuration?: Json; assetsBase?: string; source?: "cdn" }): Promise<Json> => {
    if (source === "cdn") return { source };
    if (!url === !configuration) return { error: { code: "mcp", message: "give either url, configuration or source: cdn" } };
    if (url) {
      const response = await fetch(url);
      if (!response.ok) return { error: { code: "fetch-failed", message: `${url} answered ${response.status}` } };
      configuration = (await response.json()) as Json;
    }
    return { configuration, ...(assetsBase ? { assetsBase } : {}) };
  };

  server.registerTool(
    "create_experience",
    {
      description:
        "Makes a new, empty experience (#343): a draft with one scene (a double page) and nothing on it. `slug` is its id – its address in the reader (https://<instance>/<slug>/) and its content store's folder: lower-case letters, digits and dashes, none of the site's own paths (editor, api, docs, scene, entry, …; 400 reserved-slug), not an experience's id already (409 duplicate-id). Ask the person for the slug – it can't be changed once the experience is published (printed QR codes and shared links depend on it). To bring in an existing configuration instead: import_experience.",
      inputSchema: z.object({
        slug: z.string().describe("the experience's id and reader path /<slug>/: lower-case a–z, 0–9 and -, at most 64"),
        title: z.string().min(1).max(200).describe("the experience's title (can be changed later: update_experience)"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    guard(async ({ slug, title }) => {
      const problem = slugProblem(slug);
      if (problem) return fail({ error: { code: "invalid-slug", message: problem } });
      const result = await api.call<{ experience: { id: string } }>("POST", "/editor/experiences", { id: slug, title });
      return text({ ...result, open: editorHref(links, result.experience.id), next: "Give the person the editor's link: the new experience opens on its one scene. It reaches readers at /<slug>/ with its first publish." });
    }),
  );

  server.registerTool(
    "import_experience",
    {
      description:
        "Replaces an experience's content rows from a game configuration (the content build's game.config.json, content schema 3.x – another is refused, 400 invalid-configuration): `url` fetches it (e.g. the reader's dev server http://localhost:5174/src/game.config.json), or pass `configuration`; `source: \"cdn\"` imports the current version of this experience on the instance's CDN (its own store there). `assetsBase` = where its /assets/content/… paths resolve. The change and publish logs stay; edits made since are replaced. **Two steps when the experience exists**: the first call imports nothing and answers `comparison` – the incoming build (id, date, app and schema version) against what the draft is based on and its edits since that import – and a short-lived `confirmation`. Show the comparison to the person and ask; only with their yes call again with the same arguments and `confirm: <confirmation.id>`. A new experience is imported at once. To tell the person first which experience and build would come in (the CDN's experience id among it), call preview_import.",
      inputSchema: z.object({
        experience: ID.describe("the configuration's own experience.id (preview_import's incoming.experience) – another id is refused (400 invalid-configuration)"),
        url: z.string().url().optional().describe("a game.config.json to fetch"),
        configuration: z.record(z.string(), z.unknown()).optional().describe("the game configuration itself"),
        assetsBase: z.string().url().optional().describe("the origin the configuration's /assets/content/… paths resolve against – its files.json is read from there, so the Library lists the imported files (a base without one imports with none)"),
        source: z.enum(["cdn"]).optional().describe('"cdn" = the current version of `experience` on the instance\'s CDN (CONTENT_BASE_URL/<experience>)'),
        confirm: z.string().optional().describe("the second step: the confirmation id of the comparison the person agreed to"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    guard(async ({ experience, url, configuration, assetsBase, source, confirm }) => {
      const body = await importSource({ url, configuration, assetsBase, source });
      if ("error" in body) return fail(body);
      try {
        const result = await api.call<ImportResult>("POST", `/editor/experiences/${encodeURIComponent(experience)}/import`, { ...body, ...(confirm ? { confirm } : {}) });
        return text({ ...result, open: editorHref(links, experience) });
      } catch (error) {
        const step = importStep(error);
        if (!step) throw error;
        return text({ ...step, open: editorHref(links, experience) });
      }
    }),
  );

  server.registerTool(
    "preview_import",
    {
      description:
        "What an import would bring in, before anything is imported – read-only, takes import_experience's sources: `source: \"cdn\"` (the current version of an experience on the instance's CDN – `experience`, default the instance's own), `url` (a game.config.json to fetch) or `configuration`. Answers the content base and its latest.json (build, when it became current), `incoming` (the one experience's id and title, the build, its date, app and schema version), `counts` (scenes, entries, targets, shared entities) and `existing` – the draft of that id the import would replace (what it is based on, its edits since, where it is live), null for a new experience. Tell the person which experience and build comes in and, when `existing`, that its draft is replaced and its edits lost; then import_experience with `experience` = incoming.experience and the same source.",
      inputSchema: z.object({
        url: z.string().url().optional().describe("a game.config.json to fetch"),
        configuration: z.record(z.string(), z.unknown()).optional().describe("the game configuration itself"),
        assetsBase: z.string().url().optional().describe("the origin the configuration's /assets/content/… paths resolve against – its files.json is read from there, so the Library lists the imported files (a base without one imports with none)"),
        source: z.enum(["cdn"]).optional().describe('"cdn" = an experience\'s current version on the instance\'s CDN (CONTENT_BASE_URL/<experience>)'),
        experience: ID.optional().describe("with source cdn: whose store to read – default the instance's own experience (400 invalid-experience when it has none)"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guard(async ({ url, configuration, assetsBase, source, experience: named }) => {
      const body = await importSource({ url, configuration, assetsBase, source });
      if ("error" in body) return fail(body);
      const preview = await api.call<ImportPreview>("POST", "/editor/import/preview", source === "cdn" && named ? { ...body, experience: named } : body);
      const { experience, title, build } = preview.incoming;
      return text({
        ...preview,
        imported: false,
        ...(preview.existing ? { open: editorHref(links, experience) } : {}),
        next: `Nothing was imported. Tell the person: 1 experience, “${title}” (${experience})${build ? `, build ${build}` : ""}${preview.existing ? " – it replaces the draft of that id here, and its edits since its import are lost (existing.draft.edits)" : " – a new experience"}. Import only if they want it: import_experience with experience: "${experience}" and the same source${preview.existing ? " (it answers the comparison first; ask again before confirming)" : ""}.`,
      });
    }),
  );

  server.registerTool(
    "get_experience",
    {
      description:
        "An experience's tree (content schema 3.0): the experience, its scenes in order (id, label, group, surfaces with their size and place, passes) each with its entries (id, title, category, scene, surface) and each entry's target (id, imageSrc, place, entity inline or { ref }), and the groups. Shared entities: get_entity; one scene with every entity resolved: get_scene.",
      inputSchema: z.object({ experience: EXPERIENCE }),
      annotations: read,
    },
    guard(async ({ experience }) => {
      const t = await tree(experience);
      const entries = t.scenes.reduce((n, s) => n + s.entries.length, 0);
      const targets = t.scenes.reduce((n, s) => n + s.entries.filter(e => e.target).length, 0);
      return text({ ...t, counts: { scenes: t.scenes.length, entries, targets }, open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "get_scene",
    {
      description:
        "One scene (its label, group, surfaces with size and place, passes) with its entries and targets, every target's entity resolved: an inline entity as it is, a shared one as the entity under `entity` with its `ref` next to it (put_entity changes the shared entity for every target using it; put_target with `entity` gives the target its own). Surface reference images: list_scenes.",
      inputSchema: z.object({ experience: EXPERIENCE, scene: ID.describe("the scene's id (get_experience, list_scenes)") }),
      annotations: read,
    },
    guard(async ({ experience, scene }) => {
      const [t, shared] = await Promise.all([tree(experience), entities(experience)]);
      const found = t.scenes.find(s => s.id === scene);
      if (!found) return fail({ error: { code: "not-found", message: `No scene "${scene}" in ${experience}.`, scenes: t.scenes.map(s => ({ id: s.id, label: s.label })) } });
      const { entries, ...rest } = found;
      const resolved = entries.map(entry => {
        if (!entry.target) return { ...entry, target: null };
        const { entity, ...target } = entry.target;
        if (entity && "ref" in entity) return { ...entry, target: { ...target, ref: entity.ref, entity: shared.entities[entity.ref] ?? null } };
        return { ...entry, target: { ...target, entity: entity ?? null } };
      });
      return text({ scene: rest, entries: resolved, open: editorHref(links, experience, found.id) });
    }),
  );

  server.registerTool(
    "get_entity",
    { description: "One shared entity of the experience by its ref (EntityData, the node tree); the refs are in get_experience's targets ({ ref }).", inputSchema: z.object({ experience: EXPERIENCE, ref: ID }), annotations: read },
    guard(async ({ experience, ref }) => {
      const { entities: all } = await entities(experience);
      if (!(ref in all)) return fail({ error: { code: "not-found", message: `No shared entity "${ref}" in ${experience}.`, refs: Object.keys(all) } });
      return text({ ref, entity: all[ref] });
    }),
  );

  server.registerTool(
    "get_draft",
    {
      description: "The experience's draft as the content version the engine loads: `manifest` (build, hash), `configuration` (the whole game configuration, content schema 3.0, assembled from the rows now) or `files` (its files.json). Large – prefer get_scene for one scene.",
      inputSchema: z.object({ experience: EXPERIENCE, part: z.enum(["manifest", "configuration", "files"]).default("configuration") }),
      annotations: read,
    },
    guard(async ({ experience, part }) => {
      const manifest = await api.call<DraftManifest>("GET", `/editor/experiences/${encodeURIComponent(experience)}/draft/latest.json`);
      if (part === "manifest") return text(manifest);
      const file = part === "files" ? "files.json" : "game.config.json";
      const data = await api.call<Json>("GET", `/editor/experiences/${encodeURIComponent(experience)}/draft/${manifest.build}/${file}`);
      return text({ build: manifest.build, [part]: data });
    }),
  );

  server.registerTool(
    "describe_content_model",
    {
      description:
        "What you may write: node types (and node names), placement (units, defaults), filters, components with their parameters, post-processing passes, the environment, scenes and surfaces (with their place), entries (scene, surface), a target's place, entry categories, scene presets – from the shared content contract. With `experience`: also the compiled plugins its configuration declares with the components, layers, node types and passes they recorded (their parameters), and the Code tab's sources with the types read from them.",
      inputSchema: z.object({ experience: EXPERIENCE.optional() }),
      annotations: read,
    },
    guard(async ({ experience }) => text(describeContentModel(experience ? await experienceModel(experience) : undefined))),
  );

  // ── writing: entities, targets, entries ──

  server.registerTool(
    "put_entity",
    {
      description:
        "Saves (or adds) a shared entity under `ref` – the whole node tree (EntityData: type, assets, params, filters, components, children, text, color; describe_content_model). Checked against the content contract before it is sent; the API records a change. Every target with { ref } shows it.",
      inputSchema: z.object({ experience: EXPERIENCE, ref: ID.describe("the shared entity's ref"), entity: entitySchema }),
      annotations: write,
    },
    guard(async ({ experience, ref, entity }) => {
      const { refused, warnings } = await checkWrite(entity, "entity", () => experienceModel(experience));
      if (refused) return refused;
      const result = await api.call<EntitySaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/entities/${encodeURIComponent(ref)}`, entity);
      return text({ ...result, ...warnings, open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "put_target",
    {
      description:
        "Changes a target: `entity` = its own AR content (EntityData; null removes it), `ref` = a shared entity instead, `imageSrc` = the printed image (an uploaded image asset's url – upload it with upload_asset fit: \"target\", at most 1200 px), `place` = where it lies: { surface?, x, y, width, height? } in mm from the top left corner of a surface of its entry's scene (surface by id – required when the scene has several; null removes the place), `enabled` = in the reader's experience (false switches it off: the reader leaves the target and its entry out, the editor keeps both – content schema 2.26), `recognitionOff` = true keeps this target on its printed image even when the experience's recognition is \"prepared\" (content schema 4.2; false: the experience decides). Send what changes. Checked against the contract; a change is recorded.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        target: ID.describe("the target's id (get_scene)"),
        entity: entitySchema.nullable().optional(),
        ref: ID.optional().describe("a shared entity's ref"),
        imageSrc: z.string().min(1).optional(),
        place: targetPlaceSchema.nullable().optional(),
        enabled: z.boolean().optional().describe("false = switched off: not in the reader's experience; true = in the experience again"),
        recognitionOff: z.boolean().optional().describe("true = always the printed image, never its recognition frame made ahead; false = the experience's recognition setting decides"),
      }),
      annotations: write,
    },
    guard(async ({ experience, target, entity, ref, imageSrc, place, enabled, recognitionOff }) => {
      const body: Json = {};
      if (ref !== undefined) body.ref = ref;
      else if (entity !== undefined) body.entity = entity;
      if (imageSrc !== undefined) body.imageSrc = imageSrc;
      if (place !== undefined) body.place = place;
      if (enabled !== undefined) body.enabled = enabled;
      if (recognitionOff !== undefined) body.recognitionOff = recognitionOff;
      if (Object.keys(body).length === 0) return fail({ error: { code: "mcp", message: "send entity, ref, imageSrc, place, enabled or recognitionOff" } });
      const { refused, warnings } = entity ? await checkWrite(entity, "entity", () => experienceModel(experience)) : { refused: null, warnings: {} };
      if (refused) return refused;
      const [result, t] = await Promise.all([api.call<TargetSaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/targets/${encodeURIComponent(target)}`, body), tree(experience)]);
      return text({ ...result, ...warnings, open: editorHref(links, experience, sceneOf(t, target)) });
    }),
  );

  server.registerTool(
    "add_entry",
    {
      description:
        "Makes a new entry on a scene: `scene` (a scene id – list_scenes, get_experience) and `surface` (one of its surfaces – needed when the scene has several). Then: title, category (default glossary – the reader lists it as \"Marginalia\"), body (Markdown with the experience's variables – describe_content_model entryText), caption (the line under the entry's picture, plain text), and its target – `imageSrc` (the printed image: an uploaded image asset's url), `place` (where it lies on a surface of the scene, in mm), `entity` (its AR content as a node tree, or { ref }) – or no target: an entry read only in the list (a glossary term, a text). The id comes from the title unless given; 409 duplicate-id. The reader tracks a target after a publish.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        title: z.string().min(1),
        scene: ID.describe("the entry's scene (list_scenes)"),
        surface: ID.optional().describe("one of the scene's surfaces – needed when it has several"),
        category: z.enum(EntryCategory).optional(),
        body: z.string().optional(),
        caption: z.string().max(TEXT_MAX_LENGTH).optional().describe("the line under the entry's picture (\"Image: … by …\"), plain text"),
        id: ID.optional(),
        target: z.object({
          id: ID.optional().describe("default: the entry's id"),
          imageSrc: z.string().min(1),
          place: targetPlaceSchema.optional(),
          entity: z.union([z.object({ ref: ID }), entitySchema]).optional(),
          enabled: z.boolean().optional().describe("false = switched off: the reader leaves the target and its entry out"),
        }).optional().describe("none: an entry read only in the list"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    guard(async ({ experience, target, ...entry }) => {
      if (entry.body !== undefined) {
        const refused = checkEntryText(entry.body);
        if (refused) return refused;
      }
      const entity = target?.entity;
      const inline = entity && !("ref" in entity && Object.keys(entity).length === 1);
      const { refused, warnings } = inline ? await checkWrite(entity, "target.entity", () => experienceModel(experience)) : { refused: null, warnings: {} };
      if (refused) return refused;
      const result = await api.call<EntryAdded>("POST", `/editor/experiences/${encodeURIComponent(experience)}/entries`, { ...entry, ...(target ? { target } : {}) });
      return text({ ...result, ...warnings, open: editorHref(links, experience, result.scene) });
    }),
  );

  // ── the experience's texts: entries and the experience (#223) ──

  server.registerTool(
    "get_entries",
    {
      description:
        "Every entry of the experience in the experience's order with its fields as written – title, category, scene, surface, body (Markdown with the experience's variables), author, image, caption (the line under the picture), media (a link's URL), tags – and its target's id and image (null: read in the list only). Optionally only one category, or the entries whose title, body or tags hold a word.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        category: z.enum(EntryCategory).optional(),
        search: z.string().optional().describe("a word the title, body or tags hold (case does not matter)"),
      }),
      annotations: read,
    },
    guard(async ({ experience, category, search }) => {
      const { entries } = await api.call<EntryList>("GET", `/editor/experiences/${encodeURIComponent(experience)}/entries`);
      const word = search?.toLowerCase();
      const found = entries.filter(e => (!category || e.category === category) && (!word || [e.title, e.body, e.tags.join(" ")].join(" ").toLowerCase().includes(word)));
      return text({ entries: found, count: found.length, open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "update_entry",
    {
      description:
        "Changes an entry's fields – send only what changes: title, category, scene (moves it to that scene – list_scenes), surface (one of its scene's surfaces; null: none – a scene with several surfaces needs one), body (Markdown: paragraphs at blank lines, *emphasis*, **strong**, [links](https://…); the experience's variables in braces – {hasKey}, {hasKey: …|…} – describe_content_model entryText), author, tags (the whole list), image (a picture of the experience's Library: an uploaded image's url or a file of the import), caption (the line under the picture, plain text – \"Image: … by …\"; not the Library's credit line, set_asset_credits), media (a link's http(s) URL), imageLevels (the picture at several sizes – the reader's media quality chooses one); null removes author, image, imageLevels, caption or media. A body whose braces do not parse is refused before it is sent. The change is recorded; the person checks it in the editor.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        entry: ID.describe("the entry's id (get_entries, get_experience)"),
        title: z.string().min(1).max(TEXT_MAX_LENGTH).optional(),
        category: z.enum(EntryCategory).optional(),
        scene: ID.optional().describe("the scene to move it to (list_scenes)"),
        surface: ID.nullable().optional().describe("one of its scene's surfaces; null: none"),
        body: z.string().max(BODY_MAX_LENGTH).optional(),
        author: z.string().max(TEXT_MAX_LENGTH).nullable().optional(),
        tags: z.array(z.string().max(ENTRY_TAGS.length)).max(ENTRY_TAGS.max).optional(),
        image: z.string().min(1).nullable().optional().describe("a Library picture's url (list_assets kind image); null removes it"),
        imageLevels: z.array(z.object({ level: z.number().int(), src: z.string().min(1) })).nullable().optional()
          .describe(`the picture in several sizes (content schema 4.3, #331): [{ level, src }], level ${MEDIA_LEVELS.image.join(" / ")} (px, longest side), each a Library picture; null removes them`),
        caption: z.string().max(TEXT_MAX_LENGTH).nullable().optional().describe("the line under the picture, plain text; null removes it"),
        media: z.string().nullable().optional().describe("an http(s) URL; null removes it"),
      }),
      annotations: write,
    },
    guard(async ({ experience, entry, ...changes }) => {
      if (Object.keys(changes).length === 0) return fail({ error: { code: "mcp", message: "send at least one field to change" } });
      if (changes.media && !isLinkUrl(changes.media)) return fail({ error: { code: "invalid-entry", message: "media must be an http(s) URL (nothing was sent)." } });
      if (changes.body !== undefined) {
        const refused = checkEntryText(changes.body);
        if (refused) return refused;
      }
      const result = await api.call<EntrySaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/entries/${encodeURIComponent(entry)}`, changes);
      return text({ ...result, ...textWarnings(changes.body), open: editorHref(links, experience, result.scene) });
    }),
  );

  server.registerTool(
    "update_experience",
    {
      description:
        "Changes the experience's title – the reader's splash, home page and account show it – or its printed book: `book` { author, publisher? } is the printed book this experience accompanies (the splash shows the author and the publisher above Start; the onboarding itself is the app's, not the experience's). Send what changes: `book` { author } or { publisher } changes those fields (publisher null or \"\" removes it); `book: null` removes the printed book – an experience without one (a wall, a room, an exhibition) – only with the person's yes; a new printed book needs `author`. `recognition` (content schema 4.2) = how the reader gets its targets' recognition data: \"original\" (the default – made from each printed image on the phone, the path tested with every target) or \"prepared\" (a target's grey frame made ahead where it has one – only after a test run on the phones, with the person's yes); null = the default. The change is recorded.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        title: z.string().min(1).max(TEXT_MAX_LENGTH).optional(),
        book: z
          .object({
            author: z.string().min(1).max(TEXT_MAX_LENGTH).optional(),
            publisher: z.string().max(TEXT_MAX_LENGTH).nullable().optional(),
          })
          .strict()
          .nullable()
          .optional()
          .describe("the printed book: { author?, publisher? } – the fields that change; null removes the printed book"),
        recognition: z.enum(RECOGNITION_MODES).nullable().optional().describe("\"original\" (default) or \"prepared\"; null = the default"),
      }),
      annotations: write,
    },
    guard(async ({ experience, title, book, recognition }) => {
      const changes: ExperienceUpdate = {};
      if (title !== undefined) changes.title = title;
      if (book !== undefined) changes.book = book;
      if (recognition !== undefined) changes.recognition = recognition;
      if (Object.keys(changes).length === 0 || (book && Object.keys(book).length === 0 && title === undefined && recognition === undefined)) {
        return fail({ error: { code: "mcp", message: "send title, recognition, or book with author or publisher (book: null removes the printed book)" } });
      }
      const result = await api.call<ExperienceSaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}`, changes);
      return text({ ...result, open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "delete_entry",
    {
      description:
        "Removes an entry with its target, the entity used only there and – only if asked – the Library files used only there, in **two steps**: the first call removes nothing and answers `impact` (the target, the entity that goes, a shared entity that is kept with its other targets, the Library files used only here and used elsewhere) and a short-lived `confirmation`. Show the impact to the person and ask; only with their yes call again with the same arguments and `confirm: <confirmation.id>`. `deleteFiles: true` also deletes the files used only here – only when the person asked for it (off by default; files used elsewhere are never deleted). Every removed row is in the change log, naming this AI connection.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        entry: ID,
        confirm: z.string().optional().describe("the second step: the confirmation id of the impact the person agreed to"),
        deleteFiles: z.boolean().optional().describe("with confirm: also delete the Library files used only here – only when the person asked for it"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    guard(async ({ experience, entry, confirm, deleteFiles }) => removeStep("delete_entry", experience, `/editor/experiences/${encodeURIComponent(experience)}/entries/${encodeURIComponent(entry)}`, confirm, deleteFiles)),
  );

  // ── writing: scenes, groups (#307, content schema 3.0 – a scene's order is its position, its surfaces are placed) ──

  const surfaceSchema = z
    .object({
      id: ID.describe("unique within the scene – an entry and a target's place name it"),
      label: z.string().max(TEXT_MAX_LENGTH).optional().describe("what is printed on it (186–187, Cover) – free text, never arithmetic"),
      widthMm: z.number().positive().describe(`its width in mm (a double page ${SCENE_PAGE_MM.width * 2}, a page ${SCENE_PAGE_MM.width}, a wall ${SCENE_WALL_MM.width})`),
      heightMm: z.number().positive().describe(`its height in mm (a page ${SCENE_PAGE_MM.height}, a wall ${SCENE_WALL_MM.height})`),
      place: z
        .object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
          rx: z.number().optional(),
          ry: z.number().optional(),
          rz: z.number().optional(),
        })
        .strict()
        .optional()
        .describe(
          "where the surface lies in the scene's coordinate system – its centre x, y, z in mm, rx, ry, rz in degrees (Euler XYZ, default 0); origin on the table at the middle of the first row (a double page: its spine), +x right, +y up, +z towards the reader; unrotated it lies flat face up, its top edge away from the reader – a wall ahead stands up: rx 90. Left out: the server lays every surface without one in a row",
        ),
    })
    .strict();
  const surfacesSchema = z.array(surfaceSchema).min(1).max(SCENE_SURFACES_MAX);
  const placeSchema = {
    after: ID.optional().describe("after this scene (list_scenes)"),
    before: ID.optional().describe("before this scene"),
    position: z.number().int().min(0).optional().describe("at this index (0 = first)"),
  };
  const onePlace = (place: { after?: string; before?: string; position?: number }): Result | null =>
    [place.after, place.before, place.position].filter(v => v !== undefined).length > 1 ? fail({ error: { code: "mcp", message: "give one of after, before or position" } }) : null;

  server.registerTool(
    "list_scenes",
    {
      description:
        "The experience's scenes in order (a scene is one step of the experience – a double page, a cover, a wall, a room): id, position, label, group, passes, its surfaces (id, label, widthMm, heightMm, place in the scene, `reference` – the editor-only reference image, null: none), how many entries and targets lie on it – and the groups with their scenes.",
      inputSchema: z.object({ experience: EXPERIENCE }),
      annotations: read,
    },
    guard(async ({ experience }) => {
      const result = await api.call<SceneList>("GET", `/editor/experiences/${encodeURIComponent(experience)}/scenes`);
      return text({ ...result, open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "add_scene",
    {
      description: `Adds a scene anywhere in the order, to any experience: \`preset\` (default double) – ${SCENE_PRESETS.join(", ")}: double = one surface ${SCENE_PAGE_MM.width * 2} × ${SCENE_PAGE_MM.height} mm (a double page), single = one page ${SCENE_PAGE_MM.width} × ${SCENE_PAGE_MM.height} mm (a cover is a single scene first in the order), wall = ${SCENE_WALL_MM.width} × ${SCENE_WALL_MM.height} mm standing ahead (rx 90) – gives its surfaces unless \`surfaces\` names them (surfaces without a place are laid in a row). Place it with after / before (a scene id) or position (an index); none = last. Optional: id (made by the server unless given), label (what the reader's switcher shows – 186–187, Studio wall), group. The change is recorded.`,
      inputSchema: z.object({
        experience: EXPERIENCE,
        preset: z.enum(SCENE_PRESETS).optional(),
        ...placeSchema,
        id: ID.refine(id => !isReservedSceneId(id), `not ${RESERVED_SCENE_IDS.join(", ")} – the editor's own address (the landing workspace)`).optional(),
        label: z.string().min(1).max(TEXT_MAX_LENGTH).optional().describe("what the reader shows for the scene – free text"),
        group: ID.optional().describe("a group of the experience (list_scenes)"),
        surfaces: surfacesSchema.optional().describe("instead of the preset's"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    guard(async ({ experience, ...body }) => {
      const refused = onePlace(body);
      if (refused) return refused;
      const result = await api.call<SceneAdded>("POST", `/editor/experiences/${encodeURIComponent(experience)}/scenes`, body);
      return text({ ...result, open: editorHref(links, experience, result.scene.id) });
    }),
  );

  server.registerTool(
    "move_scenes",
    {
      description:
        "Moves one or several scenes as a block (in their present order) – after / before a scene or to a position (an index among the scenes that stay) – or into a group (`group`: after its last scene unless a place is given) or out of their group (`group: null`: they stay in place, unless they sit inside it – then right after it). **Two steps**: without `apply` nothing is written – the plan answers the new `order`, the scenes that `moved` and the `groups` changes. Show it to the person; with their yes call again with the same arguments and `apply: true`. Every change is recorded.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        scenes: z.array(ID).min(1).describe("the scenes to move (list_scenes)"),
        ...placeSchema,
        group: ID.nullable().optional().describe("a group to move them into, or null to take them out of theirs"),
        apply: z.boolean().optional().describe("the second step: write the plan the person agreed to"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ experience, ...body }) => {
      const refused = onePlace(body);
      if (refused) return refused;
      if (body.after === undefined && body.before === undefined && body.position === undefined && body.group === undefined) {
        return fail({ error: { code: "mcp", message: "say where to: after, before, position or group" } });
      }
      const result = await api.call<ScenesMoved>("POST", `/editor/experiences/${encodeURIComponent(experience)}/scenes/move`, body);
      return text({ ...result, ...(result.applied ? {} : { next: "Nothing was written. Show the person the new order and the group changes; only with their yes call move_scenes again with the same arguments and apply: true." }), open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "put_scene",
    {
      description:
        "Changes a scene: `label` (free text – what the reader's switcher shows), `group` (a group of the experience; null takes it out – the scene stays in place), `surfaces` (the whole list, at least one – add, remove, resize, label, place: { id, label?, widthMm, heightMm, place? }; a surface without a place is laid in a row; a surface that goes takes its reference image), `passes` = the scene's own post-processing that replaces the experience's here ([{ type, enabled?, …parameters }] – the built-in types and the passes of the experience's plugins, describe_content_model { experience } passes; [] turns post-processing off here, null gives the scene the experience's passes again), `logic` = the scene's rules (content schema 5.0: { rules: [{ on, when?, do }], canvas? } – live while the scene is open, they listen to the bus and name nodes by address target:<targetId>/<node name>; describe_content_model logic; null removes them). Send what changes; checked against the contract. Surfaces that entries or targets lie on go only with `apply: true` – the first call answers 409 surfaces-in-use naming them (details.entries, details.targets): show the person; with their yes call again with `apply: true` – the entries stay on the scene without a surface, the targets lose their place (`cleared`). A change is recorded.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        scene: ID.describe("the scene's id (list_scenes)"),
        label: z.string().min(1).max(TEXT_MAX_LENGTH).optional(),
        group: ID.nullable().optional(),
        surfaces: surfacesSchema.optional(),
        passes: passesSchema.nullable().optional(),
        logic: z.record(z.string(), z.unknown()).nullable().optional().describe("the scene's rules { rules: [{ on, when?, do }], canvas? } (content schema 5.0, describe_content_model logic); null removes them"),
        apply: z.boolean().optional().describe("let surfaces go that entries or targets lie on – only after the person's yes"),
      }),
      annotations: write,
    },
    guard(async ({ experience, scene, ...body }) => {
      if (Object.keys(body).filter(key => key !== "apply").length === 0) return fail({ error: { code: "mcp", message: "send label, group, surfaces, passes or logic" } });
      if (body.logic) {
        const problems = logicProblems(body.logic, "logic", "scene");
        if (problems.length) {
          return fail({
            error: { code: "invalid-logic", message: "logic does not match the content contract (nothing was sent).", problems },
            hint: "describe_content_model logic: a scene's rules listen to the bus (no found / lost / tap / unlocked), name nodes by address target:<targetId>/<node name>, a condition is an expression (hasKey && tries > 2), goto takes scene:<id>.",
          });
        }
      }
      let warnings: { warnings?: string[] } = {};
      if (body.passes) {
        const check = await checkPassWrite(body.passes, "passes", () => experienceModel(experience));
        if (check.refused) return check.refused;
        warnings = check.warnings;
      }
      const result = await api.call<SceneSaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/scenes/${encodeURIComponent(scene)}`, body);
      return text({ scene: result.scene, cleared: result.cleared, ...warnings, open: editorHref(links, experience, scene) });
    }),
  );

  server.registerTool(
    "put_surface",
    {
      description:
        `Changes ONE surface of a scene without sending the whole list (put_scene sends the whole list): \`surface\` by id – an id the scene does not have **adds** it (its size from \`preset\` – double ${SCENE_PAGE_MM.width * 2} × ${SCENE_PAGE_MM.height}, single ${SCENE_PAGE_MM.width} × ${SCENE_PAGE_MM.height}, wall ${SCENE_WALL_MM.width} × ${SCENE_WALL_MM.height} mm – or widthMm and heightMm; without a place the server lays it in a row), a known one **changes** the fields sent (label – null: none –, preset or widthMm / heightMm for its size, place), \`position\` **moves** it to that index (0 = first), \`remove: true\` **removes** it (never the scene's last). Targets keep their place in mm when a surface gets smaller – check them with get_scene / render_scene. A surface that entries or targets lie on goes only with \`apply: true\`: the first call answers 409 surfaces-in-use naming them – show the person; with their yes call again with \`apply: true\`. Reads the scene's list (list_scenes), writes it with the one change (PUT …/scenes/{id}); a change is recorded.`,
      inputSchema: z.object({
        experience: EXPERIENCE,
        scene: ID.describe("the scene's id (list_scenes)"),
        surface: ID.describe("the surface's id – one the scene does not have adds a surface"),
        remove: z.boolean().optional().describe("true removes the surface (nothing else may be sent with it)"),
        label: z.string().max(TEXT_MAX_LENGTH).nullable().optional().describe("what is printed on it (186–187, Cover); null or empty: none"),
        preset: z.enum(SURFACE_SIZE_PRESETS).optional().describe("its size from a format: double page, single page, wall"),
        widthMm: z.number().positive().optional().describe("its width in mm (wins over the preset's)"),
        heightMm: z.number().positive().optional().describe("its height in mm (wins over the preset's)"),
        place: surfaceSchema.shape.place,
        position: z.number().int().min(0).optional().describe("its index in the scene's surfaces (0 = first)"),
        apply: z.boolean().optional().describe("let a surface go that entries or targets lie on – only after the person's yes"),
      }),
      annotations: write,
    },
    guard(async ({ experience, scene, apply, ...edit }) => {
      const list = await api.call<SceneList>("GET", `/editor/experiences/${encodeURIComponent(experience)}/scenes`);
      const found = list.scenes.find(s => s.id === scene);
      if (!found) return fail({ error: { code: "not-found", message: `no scene "${scene}" (scenes: ${list.scenes.map(s => s.id).join(", ")})` } });
      const result = editSurfaces(found.surfaces, edit, SCENE_SURFACES_MAX);
      if (!result.ok) return fail({ error: { code: "mcp", message: result.message } });
      if (result.done === "unchanged") return text({ surface: edit.surface, done: "unchanged", surfaces: result.surfaces, open: editorHref(links, experience, scene) });
      const saved = await api.call<SceneSaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/scenes/${encodeURIComponent(scene)}`, { surfaces: result.surfaces, ...(apply ? { apply } : {}) });
      return text({ surface: edit.surface, done: result.done, surfaces: saved.scene.surfaces, cleared: saved.cleared, open: editorHref(links, experience, scene) });
    }),
  );

  server.registerTool(
    "delete_scene",
    {
      description:
        "Removes a scene with everything on it – its entries, their targets, the entities used only there and, only if asked, the Library files used only there – in **two steps**: the first call removes nothing and answers `impact` (the scene, the entries, targets and entities that go, the shared entities that are kept with their other targets, the Library files used only here and used elsewhere) and a short-lived `confirmation`. Show the impact to the person and ask; only with their yes call again with the same arguments and `confirm: <confirmation.id>`. `deleteFiles: true` also deletes the files used only here – only when the person asked for it (off by default; files used elsewhere are never deleted). 409 initial-scene for the scene the experience opens on. Every removed row is in the change log, naming this AI connection.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        scene: ID.describe("the scene's id (list_scenes)"),
        confirm: z.string().optional().describe("the second step: the confirmation id of the impact the person agreed to"),
        deleteFiles: z.boolean().optional().describe("with confirm: also delete the Library files used only here – only when the person asked for it"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    guard(async ({ experience, scene, confirm, deleteFiles }) => removeStep("delete_scene", experience, `/editor/experiences/${encodeURIComponent(experience)}/scenes/${encodeURIComponent(scene)}`, confirm, deleteFiles)),
  );

  server.registerTool(
    "group_scenes",
    {
      description:
        "Makes a group of the picked scenes – a label over several scenes (Front matter, a chapter, a room): one stop of the reader's bottom switcher. The scenes come together where the first of them is (in their present order; a scene of another group leaves it). **Two steps**: without `apply` the plan (the group's id and label, the new order, what moves); with the person's yes the same call with `apply: true`. The id: `id`, else made from the label. Rename with rename_group, ungroup with ungroup.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        label: z.string().min(1).max(TEXT_MAX_LENGTH),
        scenes: z.array(ID).min(1),
        id: ID.optional(),
        apply: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    guard(async ({ experience, ...body }) => {
      const result = await api.call<GroupPlanned>("POST", `/editor/experiences/${encodeURIComponent(experience)}/groups`, body);
      return text({ ...result, ...(result.applied ? {} : { next: "Nothing was written. Show the person the group and the new order; only with their yes call group_scenes again with the same arguments and apply: true." }), open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "rename_group",
    { description: "Renames a group of the experience (list_scenes groups). A change is recorded.", inputSchema: z.object({ experience: EXPERIENCE, group: ID, label: z.string().min(1).max(TEXT_MAX_LENGTH) }), annotations: write },
    guard(async ({ experience, group, label }) => {
      const result = await api.call<GroupSaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/groups/${encodeURIComponent(group)}`, { label });
      return text({ ...result, open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "ungroup",
    {
      description: "Ungroups: the group goes, its scenes stay where they are, in order, without a group. Nothing else changes; a change is recorded per scene and for the groups.",
      inputSchema: z.object({ experience: EXPERIENCE, group: ID }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    guard(async ({ experience, group }) => {
      const result = await api.call<Ungrouped>("DELETE", `/editor/experiences/${encodeURIComponent(experience)}/groups/${encodeURIComponent(group)}`);
      return text({ ...result, open: editorHref(links, experience) });
    }),
  );

  // ── Surface reference images (#314): editor-only – the stage shows them on the surfaces, the content never carries them ──

  server.registerTool(
    "set_surface_reference",
    {
      description:
        "Sets, replaces or removes a surface's reference image – the picture the editor's stage shows on that surface (a scanned double page, a photo of the wall). Editor-only: never in the content, readers never see it. `url`: an image of the experience's Library (list_assets – upload_asset first, best with fit: \"reference\", scene and surface) or an imported file's /assets/content/… path; null removes it. `fit`: cover (default – cut to cover the surface), contain (fit inside) or stretch; a replace keeps the fit it had. `name` defaults to the Library's. fit / name without url change the present one. list_scenes shows each surface's `reference`. A change is recorded (revertable).",
      inputSchema: z.object({
        experience: EXPERIENCE,
        scene: ID.describe("the scene's id (list_scenes)"),
        surface: ID.describe("the surface's id in that scene (list_scenes)"),
        url: z.string().min(1).nullable().optional().describe("a Library image's URL; null removes the reference"),
        fit: z.enum(SURFACE_REFERENCE_FITS).optional(),
        name: z.string().min(1).max(255).optional(),
      }),
      annotations: write,
    },
    guard(async ({ experience, scene, surface, ...body }) => {
      if (body.url === undefined && body.fit === undefined && body.name === undefined) return fail({ error: { code: "mcp", message: "send url (null removes it), fit or name" } });
      const result = await api.call<SurfaceReferenceSaved>(
        "PUT",
        `/editor/experiences/${encodeURIComponent(experience)}/scenes/${encodeURIComponent(scene)}/surfaces/${encodeURIComponent(surface)}/reference`,
        body,
      );
      return text({ ...result, open: editorHref(links, experience, scene) });
    }),
  );

  // ── writing: the experience's passes, appearance and environment ──

  server.registerTool(
    "put_experience_passes",
    {
      description:
        "Sets the experience's post-processing – the master chain every scene without its own passes shows: [{ type, enabled?, …parameters }] run in order over the rendered image (built-in types bloom, vignette, grade, and the passes the experience's plugins register – describe_content_model { experience } passes); enabled: false switches one pass off, keeping its place and values; [] = none; null removes it. A scene's own passes (put_scene) still replace it there. Checked against the contract; a change is recorded.",
      inputSchema: z.object({ experience: EXPERIENCE, passes: passesSchema.nullable() }),
      annotations: write,
    },
    guard(async ({ experience, passes }) => {
      const check = passes === null ? { refused: null, warnings: {} } : await checkPassWrite(passes, "passes", () => experienceModel(experience));
      if (check.refused) return check.refused;
      const result = await api.call<ExperiencePassesSaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/passes`, { passes });
      return text({ ...result, ...check.warnings, open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "put_experience_landing",
    {
      description:
        "Picks the desktop landing's hero (content schema 6.1, #355): one target with AR content (a model, a video, a plugin's node type or a node a component drives) on one scene – the landing's book opens on the scene's surface the target lies on and its content rises from its print. The tool extracts the hero from the draft as the editor does (the surface, its prints, the target's entity, the print layout's pictures, the experience's plugins and looks) and saves it with the pick in experience.landing; publish writes the version's landing.json from it. A target without AR content (marginalia, a link, a target without an entity) is refused. remove: true removes the pick – the landing shows the experience's first model again. Re-run it after the entity, the prints or the looks changed (the editor's Inspector says when the stored hero is out of date). The change is recorded.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        scene: z.string().min(1).optional().describe("the scene's id"),
        target: z.string().min(1).optional().describe("the id of a target on that scene with AR content (a model, a video, a component)"),
        remove: z.boolean().optional().describe("true removes the pick"),
      }),
      annotations: write,
    },
    guard(async ({ experience, scene, target, remove }) => {
      const path = `/editor/experiences/${encodeURIComponent(experience)}`;
      if (remove) {
        const result = await api.call<ExperienceSaved>("PUT", path, { landing: null });
        return text({ ...result, open: editorHref(links, experience) });
      }
      if (!scene || !target) return fail({ error: { code: "mcp", message: "send scene and target (or remove: true)" } });
      const [{ experience: summary }, manifest] = await Promise.all([tree(experience), api.call<DraftManifest>("GET", `${path}/draft/latest.json`)]);
      const [configuration, files] = await Promise.all([
        api.call<GameConfiguration>("GET", `${path}/draft/${manifest.build}/game.config.json`),
        api.call<Record<string, unknown>>("GET", `${path}/draft/${manifest.build}/files.json`),
      ]);
      // The print layout is a public file of the import (its assets base): read without the token
      const extracted = await extractDraftLanding({ configuration, files, assetsBase: summary.assetsBase ?? "", fetch: (input, init) => fetch(input, init) }, { scene, target });
      if ("problem" in extracted) {
        return fail({ error: { code: "invalid-landing", message: `The pick cannot be the landing's hero: ${extracted.problem} (nothing was sent).` }, hint: "get_scene lists a scene's targets with their entities; the hero needs a target with AR content (a model, a video, a component)." });
      }
      const result = await api.call<ExperienceSaved>("PUT", path, { landing: extracted.landing });
      return text({ ...result, open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "put_experience_appearance",
    {
      description:
        `How the experience's AR entities appear and disappear – a look per moment: { reveal?, found?, lost?, card? }, each { type, …parameters } like a pass. card is the card look the marginalia card is picked up with (built in: ${CARD_LOOK_TYPES.join(", ")}; or a plugin's registerCardLook) – no moment, it never takes found's. reveal = the first find of a target, found = every later find, lost = the target is lost (played rewound in the look's outDuration). A moment left out takes found's look, then the default; null (or {}) removes the field – the default look plays everywhere. The whole appearance is replaced: send every moment that keeps a look. Types: the built-in ${APPEARANCE_TYPES.join(", ")} and the looks the experience's plugins register (describe_content_model { experience } appearance, with every parameter's range and default). Checked against the contract; a change is recorded.`,
      inputSchema: z.object({ experience: EXPERIENCE, appearance: appearanceSchema.nullable() }),
      annotations: write,
    },
    guard(async ({ experience, appearance }) => {
      if (appearance !== null) {
        const { problems, unverified } = checkAppearance(appearance, "appearance", usesPluginAppearances(appearance) ? await experienceModel(experience) : undefined);
        if (problems.length) {
          return fail({
            error: { code: "invalid-appearance", message: "appearance does not match the content contract (nothing was sent).", problems },
            hint: `describe_content_model { experience } lists the looks (${APPEARANCE_TYPES.join(", ")} and the experience's plugins') with their parameters.`,
          });
        }
        const result = await api.call<ExperienceAppearanceSaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/appearance`, { appearance });
        const warnings = unverified.length ? { warnings: [`looks no recorded plugin provides: ${unverified.join(", ")} – a compiled plugin of the experience must register them, else the publish is refused (unknown-appearances)`] } : {};
        return text({ ...result, ...warnings, open: editorHref(links, experience) });
      }
      const result = await api.call<ExperienceAppearanceSaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/appearance`, { appearance: null });
      return text({ ...result, open: editorHref(links, experience) });
    }),
  );

  server.registerTool(
    "put_environment",
    {
      description:
        "Sets the experience's environment – the world around the reader while scanning and the onion sky: { world, onionSky, worldSrc?, skySrc? } – worldSrc a glTF model (an uploaded asset's url: .glb / .gltf) in place of the built-in world's scenery, skySrc an equirectangular image (.jpg / .png / .webp) for the sky; null removes it (the default world, the onion sky on). Experience-level; the reader's Graphics switches still apply on top. Checked against the contract; a change is recorded.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        environment: z
          .object({
            world: z.enum(ENVIRONMENT_WORLDS),
            onionSky: z.boolean().describe("looking up, the camera picture's sky shows the world's sky"),
            worldSrc: z.string().min(1).optional().describe("a glTF model: the scenery around the reader"),
            skySrc: z.string().min(1).optional().describe("an equirectangular image (2:1): the sky"),
          })
          .strict()
          .nullable(),
      }),
      annotations: write,
    },
    guard(async ({ experience, environment }) => {
      const problems = environment === null ? [] : environmentProblems(environment);
      if (problems.length) {
        return fail({ error: { code: "invalid-environment", message: "environment does not match the content contract (nothing was sent).", problems }, hint: "describe_content_model lists the worlds and the files worldSrc and skySrc may be." });
      }
      const result = await api.call<EnvironmentSaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/environment`, { environment });
      return text({ ...result, open: editorHref(links, experience) });
    }),
  );

  // ── assets ──

  server.registerTool(
    "list_assets",
    { description: `The experience's files: id, name, kind (${ASSET_KINDS.join(" | ")}), mime, size, width / height (pixels, images and videos), durationMs (videos), version, url (what nodes and targets name – and what a plugin loads a shader by, api.loadText(url)), usages (a shader's: the plugin sources that name its url), credits (the picture credits line, null: none yet – set_asset_credits). width / height / durationMs are read from the file on upload – null when unknown (an imported file, an older upload). A video plane is one target width wide and as high as the file's proportions; scale a portrait video's node by width / height to keep it within the target's width, and time an animation by durationMs. \`imported\`: a file of the content import (no upload) – read-only.`, inputSchema: z.object({ experience: EXPERIENCE, kind: z.enum(ASSET_KINDS).optional() }), annotations: read },
    guard(async ({ experience, kind }) => text(await api.call<AssetList>("GET", `/editor/experiences/${encodeURIComponent(experience)}/assets${kind ? `?kind=${kind}` : ""}`))),
  );

  server.registerTool(
    "upload_asset",
    {
      description:
        "Uploads a file from this computer into the experience's library: models (glb, gltf), videos (mp4, webm, mov), images (jpg, png, webp), sounds (mp3, m4a, ogg, wav), at most 64 MB, and shaders (glsl, frag, vert, wgsl – UTF-8 text, at most 256 KB; a plugin loads one by its url with api.loadText) and a video's subtitles (vtt – WebVTT text, at most 256 KB; named <video name>.<language>.vtt, e.g. speak.en.vtt for speak.mp4, it belongs to every video of that name in the experience and shows as its subtitle line – no node names it). Answers the asset with its `url` – put it into a node's assets[].src or a target's imageSrc – and the file's width / height (images, videos) and durationMs (videos), null when the file does not tell. The same bytes twice are one asset, named as the last upload names it. A script (.ts, .js) is no asset: upload_plugin. " +
        `**Images go under the image rule** (#298): the API stores a jpg / png / webp as WebP (quality ${IMAGE_WEBP_QUALITY}, lossless when it has transparency), upright by its EXIF orientation, metadata dropped, its longest side at most ${IMAGE_MAX_SIDE.default} px – never scaled up – and named <name>.webp (\`converted\` says so; an instance without GD stores it as it came). Pass \`fit: "target"\` for a target's printed image (at most ${IMAGE_MAX_SIDE.target} px). TIFF and PDF are no Library files: convert them locally first. ` +
        "**Named by its use** (#298) when you say it: `entry` with fit target / entryImage → <entry>_target.webp / <entry>_image.webp, `scene` + `surface` with fit reference (a surface's reference image, set it with set_surface_reference) → <scene>_<surface>.webp (400 invalid-use for no surface of the experience).",
      inputSchema: z.object({
        experience: EXPERIENCE,
        file: z.string().describe("a local file path"),
        name: z.string().optional().describe("the file name to store (default: the path's base name; a converted image ends in .webp)"),
        fit: z.enum(IMAGE_FITS as [string, ...string[]]).optional().describe(`an image's use: target (${IMAGE_MAX_SIDE.target} px), reference (a surface's reference image, ${IMAGE_MAX_SIDE.reference} px), entryImage, default (${IMAGE_MAX_SIDE.default} px)`),
        entry: ID.optional().describe("with fit target / entryImage: the entry whose image it is – names the file <entry>_target / <entry>_image"),
        scene: ID.optional().describe("with fit reference and surface: the scene whose surface the image is for – names the file <scene>_<surface>"),
        surface: ID.optional().describe("with fit reference and scene: the surface (list_scenes)"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ experience, file, name, fit, entry, scene, surface }) => {
      if ((scene === undefined) !== (surface === undefined)) return fail({ error: { code: "mcp", message: "scene and surface go together (with fit: reference)" } });
      const bytes = new Uint8Array(await readFile(file));
      const query = imageUseQuery(fit ? { fit: fit as ImageFit, entry, surface: scene && surface ? { scene, surface } : undefined } : undefined);
      const result = await api.upload<AssetUploaded>("POST", `/editor/experiences/${encodeURIComponent(experience)}/assets${query}`, bytes, name ?? basename(file));
      return text({ ...result, size: bytes.byteLength });
    }),
  );

  server.registerTool(
    "set_asset_credits",
    {
      description:
        `Sets the picture credits of the experience's files (#277): one free text line per file, by its url (list_assets – uploaded and imported files alike), as the book prints its credits – e.g. "Book Golem by TER-JAN / DeviantArt", "Lindsey Carr, An Issue of Control, 2013. Available via DogStreets", "Gene Kelly dancing, 1944. Gjon Mili The LIFE Picture Collection/Shutterstock". No fixed structure. Empty or null removes a line. At most ${CREDITS_BATCH_MAX} files per call, ${CREDITS_MAX} characters per line; one url that is no file of the Library refuses the whole call. Credits are no content: nothing to publish, no change in the experience's log.`,
      inputSchema: z.object({
        experience: EXPERIENCE,
        items: z.array(z.object({ url: z.string().min(1).describe("the file's url (list_assets)"), credits: z.string().max(CREDITS_MAX).nullable() })).min(1).max(CREDITS_BATCH_MAX),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ experience, items }) => text(await api.call<AssetCreditsSaved>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/assets/credits`, { items }))),
  );

  server.registerTool(
    "plan_asset_names",
    {
      description:
        "Step 1 of naming the Library's files by their use (#298) – read-only: the names every used file would take, by its first use in the scenes' order: an entry's printed image p118-1_target.webp, its colour picture p118-1_image.webp, another file of the entry or its own entity p118-1_<asset id>.glb, a surface's reference image <scene>_<surface>.webp, a shared entity's file <entity>_<asset id>.ext, the environment's environment_world / environment_sky. A file used in several places takes the first (`more` counts the rest); unused files and files only a plugin's source names keep their names; two files that would take one name get -2, -3. `renames` = only the files whose name changes: { url, imported, from, to, use: { kind, ref, scene }, more }. The name only – every URL stays, so no use breaks; an imported file (read-only) gets a listed name. Show the list to the person, then apply_asset_names.",
      inputSchema: z.object({ experience: EXPERIENCE }),
      annotations: read,
    },
    guard(async ({ experience }) => {
      const result = await api.call<AssetNamesPlan>("POST", `/editor/experiences/${encodeURIComponent(experience)}/assets/names`, { apply: false });
      return text({ ...result, hint: result.plan.renames.length ? "Nothing renamed yet: show the renames to the person, then apply_asset_names." : "Every used file is named by its use already." });
    }),
  );

  server.registerTool(
    "apply_asset_names",
    {
      description:
        "Step 2 of naming the Library's files by their use (#298): makes the plan again (plan_asset_names – it may have changed since) and renames those files in one step – only after the person saw the plan. The name only: every URL and every use stays; an imported file's listed name is kept by its URL. Names are no content: nothing to publish, no change in the experience's log.",
      inputSchema: z.object({ experience: EXPERIENCE }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ experience }) => text({ ...(await api.call<AssetNamesPlan>("POST", `/editor/experiences/${encodeURIComponent(experience)}/assets/names`, { apply: true })), open: editorHref(links, experience) })),
  );

  server.registerTool(
    "rename_asset",
    {
      description:
        "Renames one file of the Library by hand (#330) – an uploaded or an imported one, by its id (list_assets: a uuid, or import-…). The name only: the URL and every use stay, so nothing breaks. White space is folded; no slash, backslash or control character; the stored file's extension stays (added when the name lacks it: `castle` → `castle.glb`); at most 255 characters (400 invalid-name otherwise). For naming every used file by where it is used, plan_asset_names is the way. Names are no content: nothing to publish, no change in the experience's log.",
      inputSchema: z.object({
        experience: EXPERIENCE,
        asset: z.string().regex(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|import-[0-9a-f]{16})$/).describe("the file's id (list_assets)"),
        name: z.string().min(1).max(255),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ experience, asset, name }) =>
      text(await api.call<AssetRenamed>("PUT", `/editor/experiences/${encodeURIComponent(experience)}/assets/${encodeURIComponent(asset)}`, { name }))),
  );

  server.registerTool(
    "delete_asset",
    { description: "Deletes an uploaded file (every version). Refused while the file is used – a target, entry, entity, scene, a surface's reference image, the experience (its environment or another setting) or a plugin source names it, the same uses list_assets counts (409 asset-in-use with the usages) unless `force`.", inputSchema: z.object({ experience: EXPERIENCE, asset: z.string().uuid().describe("the asset's id (list_assets)"), force: z.boolean().optional() }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
    guard(async ({ experience, asset, force }) => {
      await api.call<void>("DELETE", `/editor/experiences/${encodeURIComponent(experience)}/assets/${encodeURIComponent(asset)}${force ? "?force=1" : ""}`);
      return text({ deleted: asset });
    }),
  );

  // ── publishing and the logs ──

  server.registerTool(
    "publish",
    {
      description:
        "Writes the draft as a content version into the content store of this instance's own environment – an instance publishes there and nowhere else (a local development API: `local`, the staging API: `staging`; any other env → 403 other-environment). `env` may be left out: the instance's own. The answer's `store` says where it went: `cdn` (the CDN has priority where one is connected) or `server` (this API's own store, with `warning`: no edge caching – tell the person). **production is refused** – publishing to readers is the person's Publish button in the editor. Signed in with an AI connection's token (osct_…) the API refuses every environment (403 not-for-ai): then the person publishes in the editor. 409 unknown-components, unknown-node-types or unknown-materials when a node uses a component, a node type or a material no compiled plugin provides, unknown-passes when the experience's or a scene's post-processing names a pass no compiled plugin provides (the Code tab's sources reach readers through the content build only). Every experience has its own store in the environment: a publish replaces only this experience's previous build there. The other refusals: 400 invalid-env, invalid-note; 404 not-found (no such experience); 502 content-store-failed and 500 content-store-unconfigured (the store could not be read or written – nothing went live). Every refusal comes with a hint. A publish is a job on the server (#345): the tool waits for it up to about 90 s and answers its outcome with `job` (status, phase, done / total files, skipped = files the store had already); a big experience may still run then – the answer has `job.status: running` and `next`: call publish_status with the job's id until it is done or failed (`job.live`: readers already get the build while the export archive is written). 409 publish-running: a publish of the experience runs already (its `job`) – follow it with publish_status instead of publishing again.",
      inputSchema: z.object({ experience: EXPERIENCE, env: z.string().regex(ENV_NAME).optional().describe("the instance's own environment (default)"), note: z.string().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    guard(async ({ experience, env, note }) => {
      const { env: own, environments } = await api.call<EnvironmentsInfo>("GET", "/editor/environments");
      const target = env ?? own;
      if (target === "production") {
        return fail({
          error: { code: "production-is-a-person", message: "Publishing to production stays with a person: open the editor and press Publish there. This tool publishes only to a local or staging instance's own environment." },
          open: editorHref(links, experience),
        });
      }
      const started = await api.call<PublishStarted>("POST", `/editor/experiences/${encodeURIComponent(experience)}/publish`, { env: target, ...(note ? { note } : {}) });
      const warning = environments.find(e => e.env === target)?.warning;
      if ("build" in started) return text({ ...started, ...(warning ? { warning } : {}), open: editorHref(links, experience) });
      // Still running (202): follow the job for a while – each poll may write its next part on the server
      const job = await followJob(experience, started.job);
      return job.status === "failed" ? publishFailed(job) : text(publishAnswer(experience, job, warning));
    }),
  );

  /** Polls a running job until it ends or PUBLISH_TIMING.waitMs ran out */
  const followJob = async (experience: string, first: PublishJob): Promise<PublishJob> => {
    let job = first;
    const until = Date.now() + PUBLISH_TIMING.waitMs;
    while (job.status === "running" && Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, PUBLISH_TIMING.pollMs));
      job = (await api.call<{ job: PublishJob }>("GET", `/editor/experiences/${encodeURIComponent(experience)}/publish/${encodeURIComponent(job.id)}`)).job;
    }
    return job;
  };
  /** A job as the agent reads it: done → the publish's answer with the job; running → the job and what to do next */
  const publishAnswer = (experience: string, job: PublishJob, warning?: string | null) => job.status === "done" && job.result
    ? { ...job.result, job, ...(warning ? { warning } : {}), open: editorHref(links, experience) }
    : {
        job, ...(warning ? { warning } : {}), open: editorHref(links, experience),
        next: `The publish runs on the server (${job.phase}, ${job.done} / ${job.total} files${job.live ? " – readers already get the build, the export archive is still written" : ""}): call publish_status with job "${job.id}" until it is done or failed.`,
      };
  const publishFailed = (job: PublishJob) =>
    fail({ error: { status: job.error?.status ?? 500, code: job.error?.code ?? "publish-failed", message: job.error?.message ?? "The publish failed.", job } });

  server.registerTool(
    "publish_status",
    {
      description:
        "How a publish goes (#345): the job publish started – status running | done | failed, phase (version → switch → archive → done), done / total files, skipped (files the store had already), live (readers get the build; the export archive may still be written), the outcome when done (as publish answers it), the error when failed (abandoned: no one continued it and a newer publish took its place). Without `job` the experience's newest publish. Waits up to about 90 s while it runs (each poll writes the next part on the server where nothing runs on by itself); call again while `job.status` is running.",
      inputSchema: z.object({ experience: EXPERIENCE, job: z.string().uuid().optional().describe("the job's id (publish's answer); left out: the newest publish of the experience") }),
      annotations: read,
    },
    guard(async ({ experience, job: id }) => {
      const path = `/editor/experiences/${encodeURIComponent(experience)}/publish${id ? `/${encodeURIComponent(id)}` : ""}`;
      const { job } = await api.call<{ job: PublishJob | null }>("GET", path);
      if (!job) return text({ job: null, message: "No publish of this experience is kept (they are kept 14 days)." });
      const followed = await followJob(experience, job);
      return followed.status === "failed" ? publishFailed(followed) : text(publishAnswer(experience, followed));
    }),
  );

  server.registerTool(
    "list_versions",
    { description: "The publish log, newest first: env, build, hash, who, when, note.", inputSchema: z.object({ experience: EXPERIENCE }), annotations: read },
    guard(async ({ experience }) => text(await api.call<{ versions: PublishedVersion[] }>("GET", `/editor/experiences/${encodeURIComponent(experience)}/versions`))),
  );

  server.registerTool(
    "activate_version",
    {
      description:
        "Makes an older published version live again on this instance's own environment (#348, the editor's Versions → make live): `build` (list_versions) becomes the version readers get on their next start – versions.json and latest.json switch back, a row in the publish log says who did it. Builds are kept in the store, the draft is not changed. Ask the person first, naming the version's time and the environment. Signed in with an AI connection's token (osct_…) the API refuses it (403 not-for-ai): then the person does it in the editor (experiences page → the book's Versions). 404 unknown-build (not in this environment's publish log), 409 already-live, publish-running, build-missing (purged from the store), unreadable-schema (a content schema today's reader cannot read).",
      inputSchema: z.object({ experience: EXPERIENCE, build: z.string().regex(/^[0-9a-f]{12}$/).describe("the version's build (list_versions)") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    guard(async ({ experience, build }) =>
      text({ ...(await api.call<Record<string, unknown>>("POST", `/editor/experiences/${encodeURIComponent(experience)}/versions/${build}/activate`)), open: editorHref(links, experience) })),
  );

  server.registerTool(
    "list_changes",
    { description: "The change log, newest first: id, kind (entity | target | entry | scene | order | groups | environment | passes | appearance | experience | plugin | asset), ref, before, after, user, when; `set` / `reverts` for a revert's changes, `notRevertable` = why revert_change cannot take it back (null: it can). `limit` default 50, at most 500.", inputSchema: z.object({ experience: EXPERIENCE, limit: z.number().int().min(1).max(500).optional() }), annotations: read },
    guard(async ({ experience, limit }) => text(await api.call<{ changes: Change[] }>("GET", `/editor/experiences/${encodeURIComponent(experience)}/changes${limit ? `?limit=${limit}` : ""}`))),
  );

  // ── Reverts (#312): two steps – the plan, then with the person's yes `apply: true` ──
  const REVERT_NEXT = "Nothing was written. Show the person what changes (plan.changes: revert / conflict / not-revertable), the later edits of the same things (plan.later) and other people's changes (plan.others); only with their yes call again with apply: true.";
  const reverted = (experience: string, result: RevertResult) => text({
    ...result,
    ...(result.applied ? {} : { next: result.plan.counts.revert ? REVERT_NEXT : "Nothing can be reverted: every change is a conflict or not revertable." }),
    open: editorHref(links, experience),
  });
  server.registerTool(
    "revert_change",
    {
      description:
        "Takes one saved change back (list_changes' id): its `before` is written again as a NEW change, so nothing is erased and the revert can itself be reverted. Later changes of the same thing (the same entity, target, entry, scene; the same fields of the experience) would be lost, so they are reverted with it, newest first (plan.later). A thing that no longer holds what a change wrote is a conflict – listed, never overwritten. Creations, removals, moved entries, plugin sources and deleted files are not revertable. **Two steps**: without `apply` the plan; show it to the person, with their yes call again with `apply: true`. The draft only – readers see it with the next publish.",
      inputSchema: z.object({ experience: EXPERIENCE, change: z.string().min(1).describe("The change's id (list_changes)"), apply: z.boolean().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    guard(async ({ experience, change, apply }) =>
      reverted(experience, await api.call<RevertResult>("POST", `/editor/experiences/${encodeURIComponent(experience)}/changes/${encodeURIComponent(change)}/revert`, apply ? { apply: true } : {}))),
  );
  server.registerTool(
    "revert_to",
    {
      description:
        "Goes back to the state right after one saved change (list_changes' id): every change saved after it – by anyone – is reverted, newest first, as one new change set. Conflicts are listed and left alone, kinds the log cannot take back are listed as not revertable. **Two steps**: without `apply` the plan (the changes, plan.others = other people whose changes go); show it to the person, with their yes call again with `apply: true`. The draft only – never a publish.",
      inputSchema: z.object({ experience: EXPERIENCE, after: z.string().min(1).describe("The change to go back to (list_changes' id) – it stays, everything after it is reverted"), apply: z.boolean().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    guard(async ({ experience, after, apply }) =>
      reverted(experience, await api.call<RevertResult>("POST", `/editor/experiences/${encodeURIComponent(experience)}/changes/revert-to`, { after, ...(apply ? { apply: true } : {}) }))),
  );
}
