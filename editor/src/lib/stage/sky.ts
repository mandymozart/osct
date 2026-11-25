/**
 * The stage's sky and light (#185, three-free): the View menu's HDRI – a bundled studio or the experience's own (#371,
 * a Library HDRI) – shows as the sky and lights the stage while the shading is rendered; otherwise there is no sky and the
 * scene's own lights light it. The experience's environment is the reader's only (#371, Tilman: *"the environments world
 * can also go"*): the stage no longer draws its world.
 */

import type { ShadingMode, StageHdri } from "./preview";

/** What the stage shows as sky: the HDRI on its sphere, or nothing (the editor's dark ground) */
export type StageSky = "hdri" | "none";

/** What lights the stage: the HDRI (with the scene's lights stepped back) or the scene's own lights, as in the reader */
export type StageLight = "hdri" | "scene";

export interface StageLook {
  sky: StageSky;
  light: StageLight;
  /** The HDRI to load – null when it neither shows nor lights */
  hdri: StageHdri | null;
}

/** Which sky and which light, from the shading and the chosen HDRI (null: switched off) */
export const stageLook = (input: { shading: ShadingMode; hdri: StageHdri | null }): StageLook =>
  input.shading === "rendered" && input.hdri ? { sky: "hdri", light: "hdri", hdri: input.hdri } : { sky: "none", light: "scene", hdri: null };
