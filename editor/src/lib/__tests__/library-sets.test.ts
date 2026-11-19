import { describe, expect, it } from "vitest";
import type { Asset } from "../api";
import { filesSize, frameFiles, isOptionalLevel, levelCount, libraryItems, librarySets, stackRange } from "../library-sets";
import { glbJson, glbJsonLength, insideMarks, insideOf, readGlbInside } from "../glb-inside";

const asset = (name: string, extra: Partial<Asset> = {}): Asset => ({
  id: name, name, kind: "image", mime: "image/webp", size: 1000, width: null, height: null, durationMs: null, version: 1, url: `https://cdn/lib/${name}`,
  usages: 1, imported: false, credits: null, place: null, createdAt: "2026-11-01T10:00:00Z", updatedAt: "", ...extra,
});
const url = (a: Asset) => a.url;

const mesh = asset("hand-mesh.glb", { kind: "glb" });
const body512 = asset("hand-body-512.webp");
const body2048 = asset("hand-body-2048.webp");
const head512 = asset("hand-head-512.webp");
const head1024 = asset("hand-head-1024.webp");
const loose = asset("other-512.webp", { usages: 0 });
const loose2 = asset("other-1024.webp", { usages: 0 });
const film = asset("speak.mp4", { kind: "video" });
const en = asset("speak.en.vtt", { kind: "subtitles" });
const fr = asset("speak.fr.vtt", { kind: "subtitles" });
const stray = asset("gone.de.vtt", { kind: "subtitles" });
const target = asset("p1_target.webp");
const assets = [mesh, body512, body2048, head512, head1024, loose, loose2, film, en, fr, stray, target];

const scenes = [{
  targets: [{
    id: "p1",
    entity: {
      type: "group", assets: [],
      children: [{
        type: "model", name: "hand",
        assets: [{ id: "m", assetType: "glb", src: url(mesh), textures: [
          { material: "body", sizes: [{ size: 512, src: url(body512) }, { size: 2048, src: url(body2048) }] },
          { material: "head", sizes: [{ size: 512, src: url(head512) }, { size: 1024, src: url(head1024) }] },
        ] }],
      }],
    },
  }],
}];

describe("library sets (#331)", () => {
  const sets = librarySets(assets, scenes);

  it("a model node's file is a frame, each texture set a stack of its levels", () => {
    expect(sets.frames.map(f => [f.kind, f.label, f.main?.id])).toEqual([["model", "hand", mesh.id], ["video", "speak", film.id]]);
    const [body, head] = sets.frames[0].stacks;
    expect(body.label).toBe("body");
    expect(body.face).toBe(body2048);
    // 512 and 2048 there, 1024 missing between them, 4096 optional above
    expect(body.levels.map(l => [l.label, l.asset?.id ?? null])).toEqual([["512", body512.id], ["1024", null], ["2048", body2048.id], ["4096", null]]);
    expect(levelCount(body)).toEqual({ there: 2, of: 3 });
    expect(isOptionalLevel(body, body.levels[3])).toBe(true);
    expect(isOptionalLevel(body, body.levels[1])).toBe(false);
    expect(levelCount(head)).toEqual({ there: 2, of: 2 });
    expect(stackRange(head)).toBe("512 – 1024");
    expect(body.node).toEqual({ targetId: "p1", mesh: url(mesh), set: 0 });
  });

  it("files no node names stay single – the Library makes no link", () => {
    expect(sets.stackOf.has(loose.id)).toBe(false);
    expect(sets.frameOf.has(target.id)).toBe(false);
  });

  it("a video's subtitles are a stack by language in the video's frame; a subtitle without its video stays alone", () => {
    const video = sets.frames[1];
    expect(video.stacks[0].levels.map(l => l.label)).toEqual(["en", "fr"]);
    expect(stackRange(video.stacks[0])).toBe("en · fr");
    expect(sets.frameOf.get(en.id)).toBe(video);
    expect(sets.stackOf.has(stray.id)).toBe(false);
  });

  it("a group's files become items: a frame once where its first file is, the rest as files", () => {
    const items = libraryItems([target, body2048, mesh, loose, head512, en], sets);
    expect(items.map(i => [i.type, i.key])).toEqual([["file", target.id], ["frame", `model:${url(mesh)}`], ["file", loose.id], ["frame", `video:${url(film)}`]]);
    expect(libraryItems([target, mesh], sets, false).map(i => i.type)).toEqual(["file", "file"]);
    expect(frameFiles(sets.frames[0]).map(f => f.id)).toEqual([mesh.id, body512.id, body2048.id, head512.id, head1024.id]);
    expect(filesSize(frameFiles(sets.frames[0]))).toBe(5000);
  });

  it("a model without sets is no frame", () => {
    const plain = librarySets([mesh], [{ targets: [{ id: "p1", entity: { type: "model", assets: [{ src: url(mesh) }] } }] }]);
    expect(plain.frames).toEqual([]);
  });
});

/** A binary glTF with this JSON (no binary chunk) */
const glb = (json: unknown): Uint8Array => {
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const body = new TextEncoder().encode(text);
  const bytes = new Uint8Array(20 + body.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, body.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(body, 20);
  return bytes;
};

describe("what a model file carries inside (#331)", () => {
  const doc = {
    images: [{ name: "body", bufferView: 3 }, { uri: "beside.png" }],
    materials: [{ name: "body", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }, { name: "plain" }],
    animations: [{ name: "idle" }, {}],
  };

  it("reads the JSON chunk of a glb: pictures inside (not beside), mapped materials, clips", () => {
    const bytes = glb(doc);
    expect(glbJsonLength(bytes)).toBe(bytes.byteLength - 20);
    expect(insideOf(glbJson(bytes))).toEqual({ images: ["body"], mapped: ["body"], clips: ["idle", "clip 2"] });
    expect(glbJson(new Uint8Array(8))).toBeNull();
    expect(insideMarks(insideOf(doc))).toEqual(["map", "2 clips"]);
    expect(insideMarks(null)).toEqual([]);
  });

  it("fetches only the start: the stream is cancelled after the JSON", async () => {
    const bytes = glb(doc);
    let cancelled = false;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls === 1) controller.enqueue(bytes.subarray(0, 10));
        else if (pulls === 2) controller.enqueue(bytes.subarray(10));
        else controller.enqueue(new Uint8Array(1_000_000)); // the meshes – never read
      },
      cancel() { cancelled = true; },
    });
    const fetcher = (async () => new Response(stream)) as unknown as typeof fetch;
    expect(await readGlbInside("https://cdn/lib/a.glb", fetcher)).toEqual({ images: ["body"], mapped: ["body"], clips: ["idle", "clip 2"] });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(3);
    const refused = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    expect(await readGlbInside("https://cdn/lib/missing.glb", refused)).toBeNull();
  });
});
