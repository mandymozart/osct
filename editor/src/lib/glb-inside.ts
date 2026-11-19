/**
 * What a model file carries inside (#331, the Library's ◧ marks): its pictures (a map the mesh brings – the model file
 * of a texture set carries the smallest one, #260), its materials and its animation clips. Read from the glTF JSON at the
 * start of a `.glb` – only that part is fetched (the stream is cancelled after it), never the meshes or the pictures'
 * bytes. Shown, never taken apart: the Library makes no link (Tilman, 2026-11-19).
 */

export interface GlbInside {
  /** Pictures inside the file (their names, or `image N`) */
  images: string[];
  /** The materials that have a colour map, by name */
  mapped: string[];
  /** The animation clips, by name */
  clips: string[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

/** The JSON chunk's length (and the bytes before it, 20) from the first 20 bytes; null when it is no binary glTF */
export const glbJsonLength = (head: Uint8Array): number | null => {
  if (head.byteLength < 20) return null;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(16, true) !== JSON_CHUNK) return null;
  return view.getUint32(12, true);
};

/** What a glTF document holds, from its JSON */
export const insideOf = (gltf: unknown): GlbInside => {
  const doc = (gltf && typeof gltf === "object" ? gltf : {}) as {
    images?: { name?: string; uri?: string }[];
    materials?: { name?: string; pbrMetallicRoughness?: { baseColorTexture?: unknown } }[];
    animations?: { name?: string }[];
  };
  // A picture the file points at by URI is beside it, not inside
  const images = (doc.images ?? []).flatMap((image, i) => (image.uri && !image.uri.startsWith("data:") ? [] : [image.name || `image ${i + 1}`]));
  const mapped = (doc.materials ?? []).flatMap((material, i) => (material.pbrMetallicRoughness?.baseColorTexture ? [material.name || `material ${i + 1}`] : []));
  const clips = (doc.animations ?? []).map((clip, i) => clip.name || `clip ${i + 1}`);
  return { images, mapped, clips };
};

/** The JSON of a binary glTF from its first bytes; null when they are no glb or too few */
export const glbJson = (bytes: Uint8Array): unknown => {
  const length = glbJsonLength(bytes);
  if (length === null || bytes.byteLength < 20 + length) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  } catch {
    return null;
  }
};

/** Reads the stream until `want(bytes)` says how many are enough and they are there, then cancels it */
const readStart = async (body: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> => {
  const reader = body.getReader();
  let bytes = new Uint8Array(0);
  try {
    for (;;) {
      const enough = bytes.byteLength >= 20 ? (glbJsonLength(bytes) ?? 0) + 20 : 20;
      if (bytes.byteLength >= enough || bytes.byteLength >= limit) break;
      const { done, value } = await reader.read();
      if (done || !value) break;
      const next = new Uint8Array(bytes.byteLength + value.byteLength);
      next.set(bytes);
      next.set(value, bytes.byteLength);
      bytes = next;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  return bytes;
};

/** Read once per URL (a replaced file has a new URL) */
const cache = new Map<string, Promise<GlbInside | null>>();

/** What the model file at `url` carries inside; null for a `.gltf`, an unreadable file or a refused fetch */
export function readGlbInside(url: string, fetcher: typeof fetch = fetch): Promise<GlbInside | null> {
  let known = cache.get(url);
  if (!known) {
    known = (async () => {
      try {
        const response = await fetcher(url);
        if (!response.ok || !response.body) return null;
        const json = glbJson(await readStart(response.body, 8 * 1024 * 1024));
        return json ? insideOf(json) : null;
      } catch {
        return null;
      }
    })();
    cache.set(url, known);
  }
  return known;
}

/** The tile's marks: `◧ map`, `◧ 2 clips` (nothing inside: none) */
export const insideMarks = (inside: GlbInside | null): string[] => {
  if (!inside) return [];
  const marks: string[] = [];
  if (inside.images.length) marks.push(inside.images.length === 1 ? "map" : `${inside.images.length} maps`);
  if (inside.clips.length) marks.push(inside.clips.length === 1 ? "1 clip" : `${inside.clips.length} clips`);
  return marks;
};
