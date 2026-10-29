/**
 * Runtime type guards for the game configuration contract (`shared/types/game-config.ts`).
 *
 * JSON imports only give `string` for literal unions and nothing is checked at runtime, so the
 * build runs `assertGameConfiguration` before writing and the app runs it on load.
 */
import {
  ASSET_TYPES,
  AssetType,
  ENTITY_TYPES,
  EntityRefData,
  EntityType,
  GameConfiguration,
  parseContentSchema,
  STEP_ACTIONS,
  StepAction,
} from "../types/game-config";
import { ENTRY_CATEGORIES, EntryCategory } from "../types/entry";
import { componentProblems } from "../types/components";
import { pluginProblems } from "../types/plugins";
import { PRINT_SURFACES, SPREAD_FORMATS } from "../types/game-config";
import { filterProblems } from "../types/filters";
import { lightProblems } from "../types/lights";
import { placementProblems } from "../types/placement";

const oneOf = <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);

export const isEntryCategory: (value: unknown) => value is EntryCategory = oneOf(ENTRY_CATEGORIES);
export const isEntityType: (value: unknown) => value is EntityType = oneOf(ENTITY_TYPES);

/** How deep an entity's node tree may nest (the root is level 0) */
export const MAX_NODE_DEPTH = 8;
export const isAssetType: (value: unknown) => value is AssetType = oneOf(ASSET_TYPES);
export const isStepAction: (value: unknown) => value is StepAction = oneOf(STEP_ACTIONS);

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
   * Component types the registry does not know: refused unless the configuration declares plugins (the default) –
   * or always allowed (`"allow"`: the editor's stage, where the Code tab's plugins register them at Run)
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

  // With plugins declared, a component type the registry does not know yet is the plugin's (it registers it at load)
  const root0 = isObject(raw) ? raw : {};
  const hasPlugins = options.unknownComponentTypes === "allow" || (Array.isArray(root0.plugins) && root0.plugins.length > 0);

  const entity = (value: unknown, path: string, depth = 0) => {
    const e = obj(value, path);
    if (!e) return;
    if (e.id !== undefined && typeof e.id !== "string") fail(`${path}.id`, "expected a string");
    if (e.text !== undefined && typeof e.text !== "string") fail(`${path}.text`, "expected a string");
    if (e.color !== undefined && !(typeof e.color === "string" && /^#[0-9a-f]{6}$/i.test(e.color))) fail(`${path}.color`, "expected #rrggbb");
    if (e.children !== undefined) {
      if (!Array.isArray(e.children)) fail(`${path}.children`, "expected an array");
      else if (depth >= MAX_NODE_DEPTH) fail(`${path}.children`, `nested deeper than ${MAX_NODE_DEPTH} levels`);
      else e.children.forEach((child, i) => entity(child, `${path}.children[${i}]`, depth + 1));
    }
    // A node type this contract does not know is a later MINOR's: the engine renders nothing for it and keeps its
    // children (the content build and the editor's API refuse it – an author's typo never gets this far)
    if (typeof e.type !== "string" || e.type === "") fail(`${path}.type`, `expected a node type (${ENTITY_TYPES.join(", ")})`);
    else if (!isEntityType(e.type)) console.warn(`[game-config] ${path}.type: "${e.type}" is not a node type this app knows (${ENTITY_TYPES.join(", ")}) – it renders nothing, its children stay`);
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
      componentProblems(e.components, `${path}.components`, typeof e.type === "string" ? e.type : undefined, { unknownTypes: hasPlugins ? "allow" : "refuse" })
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

  arr(root, "tutorial", "config").forEach((s, i) => {
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
