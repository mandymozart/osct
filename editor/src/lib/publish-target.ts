import type { EnvironmentInfo, EnvironmentServing, EnvironmentsInfo } from "./api";
import { replaceQuestion } from "./live";

/**
 * Where Publish goes and what the step before it says (#183): an instance publishes to its own environment only – the
 * API names it (`GET /editor/environments`) with its backend, the CDN or this server (the directory store). The step
 * names the book, the build, the target, what it replaces there, and the warning wherever this server is the target.
 */

/** The environment this instance publishes to, null while unknown */
export const targetOf = (info: EnvironmentsInfo | null): EnvironmentInfo | null => info?.environments.find(e => e.publish) ?? null;

/** `staging · CDN`, `local · this server` */
export const targetLabel = (target: Pick<EnvironmentInfo, "env" | "store">): string => `${target.env} · ${target.store === "cdn" ? "CDN" : "this server"}`;

/** The in-page step before a publish, as lines */
export interface PublishStep {
  /** `Publish “Test Book” to staging · CDN` */
  title: string;
  /** `Build 1a2b3c4d5e6f – the draft now.` */
  build: string;
  /** What changes there: the build it replaces, another book it replaces, or that nothing is published there yet */
  replaces: string;
  /** Production: every reader gets it */
  readers: string | null;
  /** The directory store is the target: what that means */
  warning: string | null;
  /** The publish needs `replace: true` (another book is live there) */
  replace: boolean;
  /** The primary button */
  action: string;
}

/**
 * The step for publishing `title` (book `bookId`, its draft now at `build`) to `target`, which serves `serving`
 * (undefined: nothing; `book` null: a book the editor cannot tell); `titleOf` names a book by its id
 */
export const publishStep = (
  bookId: string,
  title: string,
  build: string | null,
  target: EnvironmentInfo,
  serving: EnvironmentServing | undefined,
  titleOf: (id: string) => string | null,
): PublishStep => {
  const where = targetLabel(target);
  const live = serving && !("error" in serving) ? serving : undefined;
  const other = !!live && live.book !== bookId;
  const otherTitle = other && live.book ? (titleOf(live.book) ?? live.book) : null;
  const replaces = !live
    ? serving
      ? `What ${target.env} serves now cannot be read.`
      : `Nothing is published on ${target.env} yet.`
    : other
      ? replaceQuestion(target.env, title, otherTitle)
      : live.build && live.build === build
        ? `${target.env} serves this build already – it stays current.`
        : `Replaces build ${live.build ?? "?"} of “${title}” on ${target.env}.`;
  return {
    title: `Publish “${title}” to ${where}`,
    build: build ? `Build ${build} – the draft now.` : "The draft now.",
    replaces,
    readers: target.env === "production" ? "Every reader of the app gets this version on their next start." : null,
    warning: target.warning,
    replace: other,
    action: other ? `Replace on ${target.env}` : `Publish to ${target.env}`,
  };
};
