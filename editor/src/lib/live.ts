import type { LiveIn } from "./api";

/**
 * Which experience an environment serves – each serves exactly one, the last one published there – in the words the Experiences
 * overview and Publish use: where an experience is live, and the question before a publish replaces another experience.
 */

const date = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : "");

/** `live on staging · build 1a2b… · since 30.10.2026`, one per environment; `draft only` when none serves it */
export const liveLabels = (live: LiveIn[] | undefined): string[] =>
  live?.length
    ? live.map(l => [`live on ${l.env}`, l.build ? `build ${l.build}` : "", l.since ? `since ${date(l.since)}` : ""].filter(Boolean).join(" · "))
    : ["draft only"];

/** The environments an experience is live on, for a short line next to Publish */
export const liveShort = (live: LiveIn[] | undefined): string => (live?.length ? `live on ${live.map(l => l.env).join(", ")}` : "draft only");

/**
 * The question before publishing `title` to `env` while it serves `current` (a title, else its id, else unknown).
 * Production is said more strictly: every reader of the experience gets the other one.
 */
export const replaceQuestion = (env: string, title: string, current: string | null): string => {
  const serving = current ? `“${current}”` : "an experience the editor cannot tell";
  return env === "production"
    ? `Production serves ${serving} – to every reader of the app. Publishing “${title}” replaces it for all of them ` +
        `until ${serving} is published to production again. Replace ${serving} with “${title}” on production?`
    : `${env[0].toUpperCase()}${env.slice(1)} serves ${serving}. Publish “${title}” instead? Readers on ${env} will see “${title}” ` +
        `until ${serving} is published there again.`;
};
