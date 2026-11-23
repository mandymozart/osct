/**
 * The names the instance's paths are made of: ids and environment names (rules.ts re-exports them). A leaf without
 * imports, so a page that only reads its address – the reader's landing (#355), the inline scripts of index.html – does
 * not load the content contract along with the rest of rules.ts.
 */

/** An id or reference in the editor API's paths and bodies – experiences, scenes, entries, targets, entities (`Editor::ID`) */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * An environment's name (`ContentStore::ENV`): the instance's ENV, a publish's `env`, the content route and the CDN's
 * `<env>/latest.json` – lower-case letters, digits and -, a letter first, at most 32
 */
export const ENV_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Scene ids the editor's own addresses take (#356): `/editor/<experience>/landing/` is the experience's landing
 * workspace, so no scene may be called so – the API refuses a new one (`Scenes::RESERVED_IDS`, 400 `reserved-id`),
 * compared lower-case
 */
export const RESERVED_SCENE_IDS: readonly string[] = ["landing"];

/** Whether a scene id is one of the editor's own addresses (`RESERVED_SCENE_IDS`, any case) */
export const isReservedSceneId = (id: string): boolean => RESERVED_SCENE_IDS.includes(id.toLowerCase());
