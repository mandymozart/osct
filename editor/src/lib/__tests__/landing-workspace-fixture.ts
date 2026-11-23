import type { GameConfiguration } from "@engine/types";

/**
 * A draft for the landing workspace's tests (#356): three scenes – s1 with a model, a video, a target without an entity
 * (marginalia) and a switched-off model; s2 with marginalia only; s3 with an empty group (draws nothing). Content paths as
 * the draft endpoint hands them out (below the assets base `CDN`), unless `paths` keeps them as content paths.
 */
export const CDN = "https://cdn.example/demo";

export const draftConfiguration = ({ paths = false, landing }: { paths?: boolean; landing?: unknown } = {}): GameConfiguration => {
  const at = (path: string) => (paths ? path : `${CDN}${path}`);
  const surface = { id: "surface", widthMm: 460, heightMm: 320 };
  const model = { type: "model", assets: [{ assetType: "glb", src: at("/assets/content/models/dragon.glb") }] };
  return {
    version: { schema: "6.2", build: "b1" },
    experience: { id: "demo", title: "Demo Book", book: { author: "A. Author", publisher: "P. Press" }, ...(landing ? { landing } : {}) },
    initialScene: "s1",
    scenes: [
      { id: "s1", label: "10–11", surfaces: [surface] },
      { id: "s2", label: "12–13", surfaces: [surface] },
      { id: "s3", label: "14–15", surfaces: [surface] },
    ],
    entries: [
      { id: "e1", category: "image", title: "Dragon", body: "", scene: "s1", target: { id: "dragon", imageSrc: at("/assets/content/targets/dragon.webp"), entity: model } },
      { id: "e2", category: "text", title: "A note", body: "", scene: "s1", target: { id: "note", imageSrc: at("/assets/content/targets/note.webp") } },
      { id: "e3", category: "image", title: "Film", body: "", scene: "s1",
        target: { id: "film", imageSrc: at("/assets/content/targets/film.webp"), entity: { type: "video", assets: [{ assetType: "video", src: at("/assets/content/videos/film.mp4") }] } } },
      { id: "e4", category: "image", title: "Off", body: "", scene: "s1", target: { id: "off", imageSrc: at("/assets/content/targets/off.webp"), entity: model, enabled: false } },
      { id: "e5", category: "text", title: "Margin", body: "", scene: "s2", target: { id: "margin", imageSrc: at("/assets/content/targets/margin.webp") } },
      { id: "e6", category: "image", title: "Empty", body: "", scene: "s3", target: { id: "empty", imageSrc: at("/assets/content/targets/empty.webp"), entity: { type: "group", children: [] } } },
    ],
    entities: {},
  } as unknown as GameConfiguration;
};
