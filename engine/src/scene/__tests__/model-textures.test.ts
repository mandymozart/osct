import { describe, expect, it, vi } from "vitest";
import { Group, Mesh, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace, Texture } from "three";
import { textureSetProblems, textureSizeFor, type TextureSetData } from "@shared/types/textures";
import { applyTextureSets, cancelTextureSets, wantedTextureSize } from "../model-textures";

const map = (width: number): Texture => {
  const texture = new Texture({ width, height: width } as unknown as HTMLImageElement);
  texture.flipY = false; // as the glTF loader sets it
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
};

/** A model of two meshes, each with its own material and a 512 map */
const model = () => {
  const root = new Group();
  const materials = ["joined", "other"].map(name => {
    const material = new MeshBasicMaterial({ map: map(512) });
    material.name = name;
    root.add(new Mesh(undefined, material));
    return material;
  });
  return { root, materials };
};

const set = (material?: string): TextureSetData => ({
  ...(material ? { material } : {}),
  sizes: [512, 1024, 2048, 4096].map(size => ({ size: size as 512, src: `/m/${material ?? "all"}_${size}.jpg` })),
});

/** Loads a map of the size its file name says */
const loader = () => vi.fn(async (src: string) => map(Number(/_(\d+)\.jpg$/.exec(src)![1])));

describe("a model's maps by texture quality (#260)", () => {
  it("auto goes by the device: data saving or a slow connection 512, little memory 1024, else 2048 – never 4096", () => {
    expect(wantedTextureSize("auto", {})).toBe(2048);
    expect(wantedTextureSize(undefined, { memory: 8 })).toBe(2048);
    expect(wantedTextureSize("auto", { memory: 4 })).toBe(1024);
    expect(wantedTextureSize("auto", { saveData: true, memory: 8 })).toBe(512);
    expect(wantedTextureSize("auto", { connection: "3g" })).toBe(512);
    expect(wantedTextureSize("auto", { connection: "slow-2g" })).toBe(512);
    expect(wantedTextureSize("auto", { connection: "4g" })).toBe(2048);
  });

  it("the reader's own choice counts, up to what the graphics card takes", () => {
    expect(wantedTextureSize(4096, { memory: 2, saveData: true })).toBe(4096);
    expect(wantedTextureSize(4096, { maxTextureSize: 2048 })).toBe(2048);
    expect(wantedTextureSize(512, {})).toBe(512);
  });

  it("shows the largest size not above the wanted one, else the set's smallest", () => {
    expect(textureSizeFor(set(), 2048)?.size).toBe(2048);
    expect(textureSizeFor({ sizes: [{ size: 1024, src: "a" }, { size: 4096, src: "b" }] }, 2048)?.size).toBe(1024);
    expect(textureSizeFor({ sizes: [{ size: 4096, src: "b" }, { size: 1024, src: "a" }] }, 512)?.size).toBe(1024);
    expect(textureSizeFor({ sizes: [] }, 512)).toBeUndefined();
  });

  it("puts the wanted size on every material with a map, set up as the file's map, and disposes what leaves", async () => {
    const { root, materials } = model();
    const olds = materials.map(material => material.map!);
    const disposed = olds.map(old => vi.spyOn(old, "dispose"));
    const load = loader();
    await applyTextureSets(root, [set()], 2048, load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("/m/all_2048.jpg");
    materials.forEach(material => {
      expect((material.map!.image as { width: number }).width).toBe(2048);
      expect(material.map!.flipY).toBe(false);
      expect(material.map!.colorSpace).toBe(SRGBColorSpace);
      expect(material.map!.wrapS).toBe(RepeatWrapping);
    });
    expect(materials[0].map).toBe(materials[1].map);
    disposed.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("a set with a material name reaches only that material", async () => {
    const { root, materials } = model();
    const other = materials[1].map;
    await applyTextureSets(root, [set("joined")], 1024, loader());
    expect((materials[0].map!.image as { width: number }).width).toBe(1024);
    expect(materials[1].map).toBe(other);
  });

  it("does not load the size the material already shows", async () => {
    const { root } = model();
    const load = loader();
    await applyTextureSets(root, [set()], 512, load);
    expect(load).not.toHaveBeenCalled();
  });

  it("swaps again when the quality changes, down as well as up", async () => {
    const { root, materials } = model();
    await applyTextureSets(root, [set()], 4096, loader());
    const large = materials[0].map!;
    const disposed = vi.spyOn(large, "dispose");
    await applyTextureSets(root, [set()], 1024, loader());
    expect((materials[0].map!.image as { width: number }).width).toBe(1024);
    expect(disposed).toHaveBeenCalled();
  });

  it("drops a map that arrives after a newer request or after the model was released", async () => {
    const { root, materials } = model();
    const first = materials[0].map;
    let arrive!: (texture: Texture) => void;
    const late = map(4096);
    const dropped = vi.spyOn(late, "dispose");
    const slow = applyTextureSets(root, [set()], 4096, () => new Promise<Texture>(resolve => (arrive = resolve)));
    cancelTextureSets(root);
    arrive(late);
    await slow;
    expect(materials[0].map).toBe(first);
    expect(dropped).toHaveBeenCalled();
  });

  it("keeps the map it has when a file fails to load", async () => {
    const { root, materials } = model();
    const first = materials[0].map;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await applyTextureSets(root, [set()], 2048, () => Promise.reject(new Error("404")));
    expect(materials[0].map).toBe(first);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("texture set checks (config guard, content build)", () => {
  it("accepts a set per material and one for every material", () => {
    expect(textureSetProblems([set()], "glb")).toEqual([]);
    expect(textureSetProblems([set("a"), set("b")], "gltf")).toEqual([]);
  });

  it("names what is wrong", () => {
    expect(textureSetProblems([set()], "image")).toEqual(["only a model file (glb / gltf) has textures"]);
    expect(textureSetProblems({}, "glb")).toEqual(["expected a list of texture sets"]);
    expect(textureSetProblems([{ sizes: [] }], "glb")).toEqual(["[0].sizes: expected at least one size"]);
    expect(textureSetProblems([set("a"), set("a")], "glb")).toEqual(['[1]: a second set for material "a"']);
    expect(textureSetProblems([{ sizes: [{ size: 800, src: "a.jpg" }, { size: 512, src: "" }, { size: 512, src: "b.jpg" }] }], "glb")).toEqual([
      "[0].sizes[0].size: 800 is not one of 512, 1024, 2048, 4096",
      "[0].sizes[1].src: expected a file",
      "[0].sizes[2].size: 512 is there twice",
    ]);
  });
});
