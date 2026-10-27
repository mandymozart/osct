/**
 * Content bundle manifest (`latest.json`) – written by the content upload (`scripts/src/upload.ts`) next to
 * the uploaded bundles of an environment, read by the app to find the current bundle:
 *
 *   <base>/latest.json                      this manifest (overwritten by every upload)
 *   <base>/<build>/game.config.json         the game configuration (immutable per build)
 *   <base>/<build>/files.json               content file sizes in bytes by path (`/assets/content/…`)
 *   <base>/<build>/assets/content/…         the content files, same paths as in the app's public folder
 *
 * `<build>` = `<version>-<hash prefix>`: the app version the bundle was built with and the content build
 * checksum (`ConfigurationVersion.hash`), so every build has its own immutable folder.
 */
export interface ContentManifest {
  /** Folder of the current bundle below the base URL */
  build: string;
  /** App version the bundle was built with (`ConfigurationVersion.version`) */
  version: string;
  /** Content schema of the bundle (`CONTENT_SCHEMA_VERSION`) */
  schema: number;
  /** Content build checksum (`ConfigurationVersion.hash`) */
  hash: string;
  /** When the bundle was uploaded (ISO 8601) */
  uploadedAt: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Path segment check: one folder name, no slashes or dots (the app builds URLs from `build`) */
const BUILD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const isContentManifest = (value: unknown): value is ContentManifest =>
  isObject(value) &&
  typeof value.build === "string" && BUILD_NAME.test(value.build) && !value.build.includes("..") &&
  typeof value.version === "string" &&
  Number.isInteger(value.schema) &&
  typeof value.hash === "string" &&
  typeof value.uploadedAt === "string";

/** `<version>-<first 12 hex digits of the hash>`: the bundle folder of a content build */
export const contentBuildName = (version: string, hash: string): string => `${version}-${hash.slice(0, 12)}`;
