/**
 * One semver version for app, tooling and server (agents/RULES.md #10). Used by the progress storage
 * (format = app MAJOR). Content compatibility is the content schema (shared/), not this version.
 */

export type Semver = { major: number; minor: number; patch: number };

/** `1.2.3` (optionally with `-pre` / `+build`) → numbers; null when it is not semver */
export const parseVersion = (version: string): Semver | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version?.trim() ?? "");
  return match ? { major: +match[1], minor: +match[2], patch: +match[3] } : null;
};
