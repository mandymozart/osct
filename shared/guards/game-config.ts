/**
 * Runtime type guards for the game configuration contract (`shared/types/game-config.ts`).
 *
 * JSON imports only give `string` for literal unions and nothing is checked at runtime, so the
 * build runs `assertGameConfiguration` before writing and the app runs it on load.
 */
import {
  ASSET_TYPES,
  type AssetType,
  CONTENT_SCHEMA_VERSION,
  ENTITY_TYPES,
  type EntityRefData,
  type EntityType,
  type GameConfiguration,
  parseContentSchema,
  STEP_ACTIONS,
  type StepAction,
} from "../types/game-config";
import { ENTRY_CATEGORIES, type EntryCategory } from "../types/entry";
import { componentProblems } from "../types/components";
import { materialProblems } from "../types/materials";
import { type PassCheckOptions, passProblems } from "../types/passes";
import { environmentProblems } from "../types/environment";
import { pluginProblems, recordedRegistrations } from "../types/plugins";
import { NODE_TYPE_PATTERN, nodeParamProblems, nodeTypeSpec } from "../types/node-types";
import { PRINT_SURFACES, SPREAD_FORMATS } from "../types/game-config";
import { filterProblems } from "../types/filters";
import { lightProblems } from "../types/lights";
import { placementProblems } from "../types/placement";
import { isObject } from "./primitives";

export { isObject } from "./primitives";

/** A pass parameter a newer MINOR adds is ignored here (the newer app reads it); the build and the API refuse it */
const GUARD_PASSES: PassCheckOptions = { unknownParams: "ignore" };

const oneOf = <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);

export const isEntryCategory: (value: unknown) => value is EntryCategory = oneOf(ENTRY_CATEGORIES);
export const isEntityType: (value: unknown) => value is EntityType = oneOf(ENTITY_TYPES);

/** How deep an entity's node tree may nest (the root is level 0) */
export const MAX_NODE_DEPTH = 8;
export const isAssetType: (value: unknown) => value is AssetType = oneOf(ASSET_TYPES);
export const isStepAction: (value: unknown) => value is StepAction = oneOf(STEP_ACTIONS);

export const isEntityRef = (value: unknown): value is EntityRefData =>
  isObject(value) && typeof value.ref === "string";

export class GameConfigurationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid game configuration (${problems.length} problem(s)):\n  - ${problems.join("\n  - ")}`);
    this.name = "GameConfigurationError";
  }
}

export interface GuardOptions {
  /**
   * Component types the registry does not know (the default, `"declared"`): refused without plugins; with plugins that
   * all recorded what they register (schema 2.14) checked against those specs and refused when none registers them;
   * with a plugin that recorded nothing (an older build) allowed – it registers them at load. Or always allowed
   * (`"allow"`: the editor's stage, where the Code tab's plugins register them at Run). The same for a plugin's node
   * type: checked against the recorded specs, refused when no declared plugin registers it, allowed where unknown – and
   * for a plugin's pass in `passes` (schema 2.21).
   */
  unknownComponentTypes?: "declared" | "allow";
}

/**
 * Throws a `GameConfigurationError` listing every problem (with its path) unless `raw` matches
 * the `GameConfiguration` contract. Also checks references: entity refs exist, ids are unique.
 */
export function assertGameConfiguration(raw: unknown, options: GuardOptions = {}): asserts raw is GameConfiguration {
  const problems: string[] = [];
  const fail = (path: string, message: string) => problems.push(`${path}: ${message}`);

  const str = (obj: Record<string, unknown>, key: string, path: string, optional = false) => {
    const value = obj[key];
    if (value === undefined && optional) return;
    if (typeof value !== "string" || (!optional && value === "")) fail(`${path}.${key}`, "expected a non-empty string");
  };
  const num = (obj: Record<string, unknown>, key: string, path: string) => {
    if (typeof obj[key] !== "number" || !Number.isFinite(obj[key])) fail(`${path}.${key}`, "expected a number");
  };
  const arr = (obj: Record<string, unknown>, key: string, path: string): unknown[] => {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    fail(`${path}.${key}`, "expected an array");
    return [];
  };
  const obj = (value: unknown, path: string): Record<string, unknown> | null => {
    if (isObject(value)) return value;
    fail(path, "expected an object");
    return null;
  };

  // The declared plugins' recorded specs (schema 2.14): what they register is known without running them. A plugin that
  // recorded nothing registers what it registers at load – a type the registry does not know may be its own
  const root0 = isObject(raw) ? raw : {};
  const declared = Array.isArray(root0.plugins) ? root0.plugins : [];
  const recorded = recordedRegistrations(declared);
  const allowUnknown = options.unknownComponentTypes === "allow" || (declared.length > 0 && !recorded.complete);
  // Content of a newer schema may have built-in node types this app does not know: those only warn (below)
  const ours = parseContentSchema(CONTENT_SCHEMA_VERSION)!;
  const theirs = isObject(root0.version) ? parseContentSchema(root0.version.schema) : null;
  const newerContent = !!theirs && (theirs.major > ours.major || (theirs.major === ours.major && theirs.minor > ours.minor));
  const refuseUnknownNodes = declared.length > 0 && recorded.complete && !newerContent;
  // A plugin's pass (schema 2.21): checked against the recorded spec like a built-in pass; a type no declared plugin
  // recorded is refused (as a 2.20 guard refuses every plugin pass), unless a plugin is unknown until it runs
  const passOptions: PassCheckOptions = {
    ...GUARD_PASSES,
    spec: type => recorded.passes.get(type),
    pluginTypes: [...recorded.passes.keys()],
    unknownTypes: allowUnknown ? "allow" : "refuse",
  };

  const entity = (value: unknown, path: string, depth = 0) => {
    const e = obj(value, path);
    if (!e) return;
    if (e.id !== undefined && typeof e.id !== "string") fail(`${path}.id`, "expected a string");
    if (e.name !== undefined && typeof e.name !== "string") fail(`${path}.name`, "expected a string");
    if (e.text !== undefined && typeof e.text !== "string") fail(`${path}.text`, "expected a string");
    if (e.color !== undefined && !(typeof e.color === "string" && /^#[0-9a-f]{6}$/i.test(e.color))) fail(`${path}.color`, "expected #rrggbb");
    if (e.children !== undefined) {
      if (!Array.isArray(e.children)) fail(`${path}.children`, "expected an array");
      else if (depth >= MAX_NODE_DEPTH) fail(`${path}.children`, `nested deeper than ${MAX_NODE_DEPTH} levels`);
      else e.children.forEach((child, i) => entity(child, `${path}.children[${i}]`, depth + 1));
    }
    // A plugin's node type (schema 2.13): registered or recorded by a declared plugin (2.14) – its parameters are checked
    // against its spec; declared plugins recorded what they register and none registers it – refused (unless the content
    // is of a newer schema, below); a declared plugin recorded nothing – it may register it when it loads. Any other
    // type this contract does not know is a later MINOR's: the engine renders nothing for it and keeps its children
    // (the content build and the editor's API refuse it – an author's typo never gets this far)
    if (typeof e.type !== "string" || e.type === "") fail(`${path}.type`, `expected a node type (${ENTITY_TYPES.join(", ")})`);
    else if (!isEntityType(e.type)) {
      const spec = nodeTypeSpec(e.type) ?? recorded.nodeTypes.get(e.type);
      if (spec) nodeParamProblems(spec, e.params, `${path}.params`, e.type).forEach(problem => problems.push(problem));
      else if (allowUnknown && NODE_TYPE_PATTERN.test(e.type)) {
        // the plugin registers it when it loads
      } else if (refuseUnknownNodes) {
        const plugins = [...recorded.nodeTypes.keys()];
        fail(`${path}.type`, `"${e.type}" is not a node type – neither built in (${ENTITY_TYPES.join(", ")}) nor registered by a plugin of the book${plugins.length ? ` (${plugins.join(", ")})` : ""}`);
      } else {
        console.warn(`[game-config] ${path}.type: "${e.type}" is not a node type this app knows (${ENTITY_TYPES.join(", ")}) – it renders nothing, its children stay`);
      }
    }
    if (e.light !== undefined) {
      if (e.type !== "light") fail(`${path}.light`, "only light nodes have a light");
      lightProblems(e.light, `${path}.light`).forEach(problem => problems.push(problem));
    }
    arr(e, "assets", path).forEach((a, i) => {
      const asset = obj(a, `${path}.assets[${i}]`);
      if (!asset) return;
      str(asset, "id", `${path}.assets[${i}]`);
      str(asset, "src", `${path}.assets[${i}]`);
      if (!isAssetType(asset.assetType)) {
        fail(`${path}.assets[${i}].assetType`, `"${asset.assetType}" is not one of ${ASSET_TYPES.join(", ")}`);
      }
    });
    if (e.params !== undefined && !isObject(e.params)) fail(`${path}.params`, "expected an object");
    placementProblems(e.params, `${path}.params`).forEach(problem => problems.push(problem));
    if (e.filters !== undefined) {
      if (e.type !== "video") fail(`${path}.filters`, "filters only work on video entities");
      filterProblems(e.filters, `${path}.filters`).forEach(problem => problems.push(problem));
    }
    if (e.components !== undefined) {
      componentProblems(e.components, `${path}.components`, typeof e.type === "string" ? e.type : undefined, { unknownTypes: allowUnknown ? "allow" : "refuse", specs: recorded.components })
        .forEach(problem => problems.push(problem));
    }
    // A plugin's material (schema 2.17): checked against the registry or the declared plugins' recorded specs, like a component
    if (e.material !== undefined) {
      materialProblems(e.material, `${path}.material`, typeof e.type === "string" ? e.type : undefined, { unknownTypes: allowUnknown ? "allow" : "refuse", specs: recorded.materials })
        .forEach(problem => problems.push(problem));
    }
  };

  const root = obj(raw, "config");
  if (!root) throw new GameConfigurationError(problems);

  const version = obj(root.version, "version");
  if (version) {
    str(version, "version", "version");
    str(version, "timestamp", "version");
    str(version, "hash", "version", true);
    if (!parseContentSchema(version.schema)) fail("version.schema", 'expected "MAJOR.MINOR", e.g. "1.0"');
  }

  const book = obj(root.book, "book");
  if (book) {
    ["id", "title", "author"].forEach(key => str(book, key, "book"));
    str(book, "publisher", "book", true);
    if (book.passes !== undefined) passProblems(book.passes, "book.passes", passOptions).forEach(problem => problems.push(problem));
    if (book.environment !== undefined) environmentProblems(book.environment, "book.environment", false).forEach(problem => problems.push(problem));
  }

  str(root, "initialSpreadId", "config");
  if (root.plugins !== undefined) pluginProblems(root.plugins).forEach(problem => problems.push(problem));

  const spreadIds = new Set<string>();
  const pageRanges: [number, number][] = [];
  arr(root, "spreads", "config").forEach((s, i) => {
    const path = `spreads[${i}]`;
    const spread = obj(s, path);
    if (!spread) return;
    ["id", "title"].forEach(key => str(spread, key, path));
    ["firstPage", "lastPage"].forEach(key => num(spread, key, path));
    if (spread.format !== undefined && !(SPREAD_FORMATS as readonly unknown[]).includes(spread.format)) {
      fail(`${path}.format`, `"${spread.format}" is not one of ${SPREAD_FORMATS.join(", ")}`);
    }
    if (spread.passes !== undefined) passProblems(spread.passes, `${path}.passes`, passOptions).forEach(problem => problems.push(problem));
    if (typeof spread.id === "string") {
      if (spreadIds.has(spread.id)) fail(`${path}.id`, `duplicate spread id "${spread.id}"`);
      spreadIds.add(spread.id);
    }
    if (typeof spread.firstPage === "number" && typeof spread.lastPage === "number") {
      pageRanges.push([spread.firstPage, spread.lastPage]);
    }
  });
  if (typeof root.initialSpreadId === "string" && !spreadIds.has(root.initialSpreadId)) {
    fail("config.initialSpreadId", `unknown spread "${root.initialSpreadId}"`);
  }

  const entities = obj(root.entities, "entities") ?? {};
  Object.entries(entities).forEach(([id, e]) => entity(e, `entities.${id}`));

  const entryIds = new Set<string>();
  const targetIds = new Set<string>();
  arr(root, "entries", "config").forEach((e, i) => {
    const path = `entries[${i}]`;
    const entry = obj(e, path);
    if (!entry) return;
    ["id", "title"].forEach(key => str(entry, key, path));
    ["author", "image", "media"].forEach(key => str(entry, key, path, true));
    if (typeof entry.body !== "string") fail(`${path}.body`, "expected a string");
    num(entry, "page", path);
    // The access page decides the spread
    const page = entry.page;
    if (typeof page === "number" && !pageRanges.some(([first, last]) => page >= first && page <= last)) {
      fail(`${path}.page`, `page ${page} is not part of any spread`);
    }
    if (!isEntryCategory(entry.category)) {
      fail(`${path}.category`, `"${entry.category}" is not one of ${ENTRY_CATEGORIES.join(", ")}`);
    }
    if (!arr(entry, "tags", path).every(tag => typeof tag === "string")) fail(`${path}.tags`, "expected strings");
    if (typeof entry.id === "string") {
      if (entryIds.has(entry.id)) fail(`${path}.id`, `duplicate entry id "${entry.id}"`);
      entryIds.add(entry.id);
    }

    if (entry.target === undefined) return;
    const tPath = `${path}.target`;
    const target = obj(entry.target, tPath);
    if (!target) return;
    str(target, "id", tPath);
    str(target, "imageSrc", tPath);
    if (target.print !== undefined) {
      const print = obj(target.print, `${tPath}.print`);
      if (print) {
        if (!(PRINT_SURFACES as readonly unknown[]).includes(print.surface)) fail(`${tPath}.print.surface`, `expected one of ${PRINT_SURFACES.join(", ")}`);
        (["x", "y", "width"] as const).forEach(key => {
          if (typeof print[key] !== "number" || !Number.isFinite(print[key])) fail(`${tPath}.print.${key}`, "expected a number (mm)");
        });
        if (print.height !== undefined && (typeof print.height !== "number" || !Number.isFinite(print.height))) fail(`${tPath}.print.height`, "expected a number (mm)");
        if (print.page !== undefined && (typeof print.page !== "number" || !Number.isInteger(print.page))) fail(`${tPath}.print.page`, "expected a page number");
      }
    }
    if (typeof target.id === "string") {
      if (targetIds.has(target.id)) fail(`${tPath}.id`, `duplicate target id "${target.id}"`);
      targetIds.add(target.id);
    }
    if (target.entity === undefined) return;
    if (isEntityRef(target.entity)) {
      if (!(target.entity.ref in entities)) fail(`${tPath}.entity.ref`, `unknown entity "${target.entity.ref}"`);
    } else {
      entity(target.entity, `${tPath}.entity`);
    }
  });

  // The onboarding apps of schema 2.24 and before read (optional since 2.25 – the reader has its own)
  if (root.tutorial !== undefined) arr(root, "tutorial", "config").forEach((s, i) => {
    const path = `tutorial[${i}]`;
    const step = obj(s, path);
    if (!step) return;
    str(step, "id", path);
    ["title", "description", "footer", "illustration", "button"].forEach(key => str(step, key, path, true));
    num(step, "index", path);
    if (step.action !== undefined && !isStepAction(step.action)) fail(`${path}.action`, `expected one of ${STEP_ACTIONS.join(", ")}`);
    ["fadeIn", "stagger", "advance"].forEach(key => step[key] !== undefined && num(step, key, path));
  });

  if (problems.length > 0) throw new GameConfigurationError(problems);
}
