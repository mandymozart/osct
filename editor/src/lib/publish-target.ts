import type { EnvironmentInfo, EnvironmentsInfo } from "./api";

/**
 * Where Publish goes (#183): an instance publishes to its own environment only – the API names it
 * (`GET /editor/environments`) with its backend, the CDN or this server (the directory store). Every experience has a
 * store of its own in each environment (#87), so a publish only ever replaces the experience's own previous build there –
 * any experience can publish to staging or production. What the Publish overlay says: `publish-overlay.ts` (#345).
 */

/** The environment this instance publishes to, null while unknown */
export const targetOf = (info: EnvironmentsInfo | null): EnvironmentInfo | null => info?.environments.find(e => e.publish) ?? null;

/** `staging · CDN`, `local · this server` */
export const targetLabel = (target: Pick<EnvironmentInfo, "env" | "store">): string => `${target.env} · ${target.store === "cdn" ? "CDN" : "this server"}`;
