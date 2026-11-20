import type { EnvironmentInfo, EnvironmentsInfo, LiveIn } from "./api";

/**
 * Where Publish goes and what the step before it says (#183): an instance publishes to its own environment only – the
 * API names it (`GET /editor/environments`) with its backend, the CDN or this server (the directory store). Every
 * experience has a store of its own in each environment (#87), so a publish only ever replaces the experience's own
 * previous build there – any experience can publish to staging or production. The step names the experience, the build,
 * the target, the build it replaces, and the warning wherever this server is the target.
 */

/** The environment this instance publishes to, null while unknown */
export const targetOf = (info: EnvironmentsInfo | null): EnvironmentInfo | null => info?.environments.find(e => e.publish) ?? null;

/** `staging · CDN`, `local · this server` */
export const targetLabel = (target: Pick<EnvironmentInfo, "env" | "store">): string => `${target.env} · ${target.store === "cdn" ? "CDN" : "this server"}`;

/** The in-page step before a publish, as lines */
export interface PublishStep {
  /** `Publish “Test Experience” to staging · CDN` */
  title: string;
  /** `Build 1a2b3c4d5e6f – the draft now.` */
  build: string;
  /** What changes there: the build of this experience it replaces, or that it is not published there yet */
  replaces: string;
  /** Production: every reader of the experience gets it */
  readers: string | null;
  /** The directory store is the target: what that means */
  warning: string | null;
  /** The primary button */
  action: string;
}

/**
 * The step for publishing `title` (its draft now at `build`) to `target`, where the experience is `live` (undefined: not
 * published there; `"unreadable"`: its store there cannot be read). `plugins` = the Code tab's saved sources the publish
 * carries (#78): their code is part of the version, so the build published is another than the draft's – the step says so
 * instead of naming the draft's.
 */
export const publishStep = (
  title: string,
  build: string | null,
  target: EnvironmentInfo,
  live: LiveIn | "unreadable" | undefined,
  plugins = 0,
): PublishStep => {
  const replaces = live === "unreadable"
    ? `What ${target.env} serves of “${title}” now cannot be read.`
    : !live
      ? `“${title}” is not published on ${target.env} yet.`
      : live.build && live.build === build && !plugins
        ? `${target.env} serves this build already – it stays current.`
        : `Replaces build ${live.build ?? "?"} of “${title}” on ${target.env}.`;
  const carried = plugins === 1 ? "the Code tab's plugin" : `the Code tab's ${plugins} plugins`;
  return {
    title: `Publish “${title}” to ${targetLabel(target)}`,
    build: plugins
      ? `The draft now, with ${carried} – transpiled, not type-checked; the build gets its name when it is published.`
      : build ? `Build ${build} – the draft now.` : "The draft now.",
    replaces,
    readers: target.env === "production" ? `Every reader of “${title}” gets this version on their next start.` : null,
    warning: target.warning,
    action: `Publish to ${target.env}`,
  };
};
