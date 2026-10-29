/**
 * Game configuration contract (`game.config.json`), defined once in `shared/` (RULES #13), and the app models the
 * engine maps it to (`Target`, `Entry`, `Spread`, `Step` – engine/src/types/content.ts). Re-exported so the app can
 * import them from `@/types`.
 */
export * from "@engine/types/content";
