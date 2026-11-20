import type { LiveIn } from "./api";

/**
 * Where an experience is live – the environments whose store of it (#87: every experience has its own store in each
 * environment) names a current build – in the words the Experiences overview and Publish use.
 */

const date = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : "");

/** `live on staging · build 1a2b… · since 30.10.2026`, one per environment; `draft only` when none serves it */
export const liveLabels = (live: LiveIn[] | undefined): string[] =>
  live?.length
    ? live.map(l => [`live on ${l.env}`, l.build ? `build ${l.build}` : "", l.since ? `since ${date(l.since)}` : ""].filter(Boolean).join(" · "))
    : ["draft only"];

/** The environments an experience is live on, for a short line next to Publish */
export const liveShort = (live: LiveIn[] | undefined): string => (live?.length ? `live on ${live.map(l => l.env).join(", ")}` : "draft only");
