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
  ENTRY_CATEGORIES,
  EntityRefData,
  EntityType,
  EntryCategory,
  GameConfiguration,
} from "../types/game-config";

const oneOf = <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);

export const isEntryCategory: (value: unknown) => value is EntryCategory = oneOf(ENTRY_CATEGORIES);
export const isEntityType: (value: unknown) => value is EntityType = oneOf(ENTITY_TYPES);
export const isAssetType: (value: unknown) => value is AssetType = oneOf(ASSET_TYPES);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isEntityRef = (value: unknown): value is EntityRefData =>
  isObject(value) && typeof value.ref === "string";

export class GameConfigurationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid game configuration (${problems.length} problem(s)):\n  - ${problems.join("\n  - ")}`);
    this.name = "GameConfigurationError";
  }
}

/**
 * Throws a `GameConfigurationError` listing every problem (with its path) unless `raw` matches
 * the `GameConfiguration` contract. Also checks references: entity refs exist, ids are unique.
 */
export function assertGameConfiguration(raw: unknown): asserts raw is GameConfiguration {
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

  const entity = (value: unknown, path: string) => {
    const e = obj(value, path);
    if (!e) return;
    if (!isEntityType(e.type)) fail(`${path}.type`, `"${e.type}" is not one of ${ENTITY_TYPES.join(", ")}`);
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
  };

  const root = obj(raw, "config");
  if (!root) throw new GameConfigurationError(problems);

  const version = obj(root.version, "version");
  if (version) {
    str(version, "version", "version");
    str(version, "timestamp", "version");
    str(version, "hash", "version", true);
  }

  const book = obj(root.book, "book");
  if (book) ["id", "title", "author"].forEach(key => str(book, key, "book"));

  num(root, "maxTargetsPerSpread", "config");
  str(root, "initialSpreadId", "config");

  const spreadIds = new Set<string>();
  arr(root, "spreads", "config").forEach((s, i) => {
    const path = `spreads[${i}]`;
    const spread = obj(s, path);
    if (!spread) return;
    ["id", "title", "mindSrc"].forEach(key => str(spread, key, path));
    ["firstPage", "lastPage"].forEach(key => num(spread, key, path));
    if (typeof spread.id === "string") {
      if (spreadIds.has(spread.id)) fail(`${path}.id`, `duplicate spread id "${spread.id}"`);
      spreadIds.add(spread.id);
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
    num(target, "index", tPath);
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
    ["id", "title", "description"].forEach(key => str(step, key, path));
    str(step, "illustration", path, true);
    num(step, "index", path);
  });

  if (problems.length > 0) throw new GameConfigurationError(problems);
}
