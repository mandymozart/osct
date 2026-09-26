import { AnimationClip, Group, Material, Mesh, Object3D, SRGBColorSpace, Texture, TextureLoader, VideoTexture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { AssetData } from "@/types";

/**
 * The AR scene's assets by id – what `<a-assets>` did under A-Frame. Loaded once per id, kept while a
 * spread uses them (a spread switch keeps the assets both spreads use), disposed (GPU memory) when
 * released. Requests hit the browser cache the PreloaderService filled.
 */

export type LoadedAsset =
  | { assetType: "glb" | "gltf"; scene: Group; animations: AnimationClip[] }
  | { assetType: "image"; texture: Texture }
  | { assetType: "video"; element: HTMLVideoElement; texture: VideoTexture }
  | { assetType: "audio"; element: HTMLAudioElement };

interface Entry {
  data: AssetData;
  loading: Promise<LoadedAsset | null>;
  loaded: LoadedAsset | null;
}

let gltfLoader: GLTFLoader | null = null;
const getGltfLoader = (): GLTFLoader => {
  if (!gltfLoader) {
    gltfLoader = new GLTFLoader();
    gltfLoader.setMeshoptDecoder(MeshoptDecoder); // models compressed with gltf-transform (meshopt)
  }
  return gltfLoader;
};

/** Hidden home for media elements (iOS decodes video frames more reliably for elements in the DOM) */
const mediaContainer = (): HTMLElement => {
  let el = document.getElementById("ar-media");
  if (!el) {
    el = document.createElement("div");
    el.id = "ar-media";
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "absolute", width: "0", height: "0", overflow: "hidden" });
    document.body.appendChild(el);
  }
  return el;
};

const media = <T extends HTMLMediaElement>(tag: "video" | "audio", data: AssetData): T => {
  const el = document.createElement(tag) as T;
  el.id = data.id;
  el.crossOrigin = "anonymous";
  el.preload = "auto";
  if (el instanceof HTMLVideoElement) {
    el.loop = true;
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
  }
  el.src = data.src;
  mediaContainer().appendChild(el);
  return el;
};

const load = async (data: AssetData): Promise<LoadedAsset | null> => {
  switch (data.assetType) {
    case "glb":
    case "gltf": {
      const gltf = await getGltfLoader().loadAsync(data.src);
      return { assetType: data.assetType, scene: gltf.scene, animations: gltf.animations };
    }
    case "image": {
      const texture = await new TextureLoader().setCrossOrigin("anonymous").loadAsync(data.src);
      texture.colorSpace = SRGBColorSpace;
      return { assetType: "image", texture };
    }
    case "video": {
      const element = media<HTMLVideoElement>("video", data);
      const texture = new VideoTexture(element);
      texture.colorSpace = SRGBColorSpace;
      return { assetType: "video", element, texture };
    }
    case "audio":
      return { assetType: "audio", element: media<HTMLAudioElement>("audio", data) };
    default:
      console.warn(`[assets] Unknown asset type ${(data as AssetData).assetType} (${(data as AssetData).id})`);
      return null;
  }
};

/** Free the GPU memory of a loaded model (geometries, materials, their textures) */
export const disposeObject = (root: Object3D): void => {
  root.traverse(object => {
    const mesh = object as Mesh;
    mesh.geometry?.dispose();
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach(material => {
      Object.values(material).forEach(value => {
        if (value instanceof Texture) value.dispose();
      });
      material.dispose();
    });
  });
};

const dispose = (asset: LoadedAsset): void => {
  switch (asset.assetType) {
    case "glb":
    case "gltf":
      disposeObject(asset.scene);
      break;
    case "image":
      asset.texture.dispose();
      break;
    case "video":
    case "audio":
      if (asset.assetType === "video") asset.texture.dispose();
      asset.element.pause();
      asset.element.removeAttribute("src");
      asset.element.load(); // release the media buffer
      asset.element.remove();
      break;
  }
};

export class AssetStore {
  private entries = new Map<string, Entry>();

  /** Load assets (known ids are reused). A failed asset resolves to null – its entity is skipped. */
  async load(assets: readonly AssetData[]): Promise<void> {
    await Promise.all(assets.map(data => {
      let entry = this.entries.get(data.id);
      if (!entry) {
        const created: Entry = { data, loaded: null, loading: Promise.resolve(null) };
        created.loading = load(data)
          .then(loaded => (created.loaded = loaded))
          .catch(error => {
            console.warn(`[assets] Could not load ${data.id} (${data.src}):`, error);
            return null;
          });
        entry = created;
        this.entries.set(data.id, entry);
      }
      return entry.loading;
    }));
  }

  get(id: string): LoadedAsset | undefined {
    return this.entries.get(id)?.loaded ?? undefined;
  }

  /** Dispose every asset whose id is not in `keep` */
  release(keep: Set<string> = new Set()): void {
    this.entries.forEach((entry, id) => {
      if (keep.has(id)) return;
      this.entries.delete(id);
      // Still loading: dispose when it arrives
      void entry.loading.then(loaded => loaded && dispose(loaded));
    });
  }
}
