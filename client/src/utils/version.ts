/**
 * One semver version for app and content build (agents/RULES.md #10).
 * Used by the game configuration startup check and the progress storage (format = app MAJOR).
 */

export type Semver = { major: number; minor: number; patch: number };

/** `1.2.3` (optionally with `-pre` / `+build`) → numbers; null when it is not semver */
export const parseVersion = (version: string): Semver | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version?.trim() ?? "");
  return match ? { major: +match[1], minor: +match[2], patch: +match[3] } : null;
};

export type VersionCompatibility = "same" | "compatible" | "incompatible";

/**
 * Game configuration vs app: another MAJOR (or no semver) = incompatible, the content has to be
 * rebuilt. MINOR/PATCH differences must just work.
 */
export const compareVersions = (appVersion: string, otherVersion: string): VersionCompatibility => {
  const app = parseVersion(appVersion);
  const other = parseVersion(otherVersion);
  if (!app || !other || app.major !== other.major) return "incompatible";
  return appVersion === otherVersion ? "same" : "compatible";
};
