/**
 * The book's environment (content schema 2.7): the world around the reader while scanning and the onion sky
 * (`engine/src/scene/look-around`, docs/look-around.md). Book-level only – no per-spread overrides, no world assets.
 * The reader's Graphics switches (Info → Settings) still apply on top: the content says what is drawn, the reader can
 * turn either off. A book without `environment` keeps today's look (`DEFAULT_ENVIRONMENT`).
 */

export const ENVIRONMENT_WORLDS = ["cafe"] as const;
export type EnvironmentWorld = (typeof ENVIRONMENT_WORLDS)[number];

export interface EnvironmentData {
  /** The world around the reader; `cafe` is the built-in one */
  world: EnvironmentWorld;
  /** Looking up, the sky in the camera picture shows the world's sky */
  onionSky: boolean;
}

export const DEFAULT_ENVIRONMENT: EnvironmentData = { world: "cafe", onionSky: true };

/** The book's environment, the default when it has none */
export const environmentOf = (book: { environment?: EnvironmentData } | null | undefined): EnvironmentData =>
  book?.environment ?? DEFAULT_ENVIRONMENT;

/** The problems of an `environment` value (the content build and the editor API check the same rules); [] when valid */
export const environmentProblems = (value: unknown, path = "environment"): string[] => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${path} must be an object { world, onionSky }.`];
  const { world, onionSky, ...rest } = value as Record<string, unknown>;
  const problems: string[] = [];
  if (!(ENVIRONMENT_WORLDS as readonly unknown[]).includes(world)) problems.push(`${path}.world must be one of ${ENVIRONMENT_WORLDS.join(", ")}.`);
  if (typeof onionSky !== "boolean") problems.push(`${path}.onionSky must be true or false.`);
  for (const key of Object.keys(rest)) problems.push(`${path}.${key} is not a field of the environment.`);
  return problems;
};
