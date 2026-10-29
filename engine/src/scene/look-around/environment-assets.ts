import {
  CubeCamera, CubeTexture, DirectionalLight, EquirectangularReflectionMapping, HalfFloatType, HemisphereLight, LinearFilter, Material, Mesh, Object3D,
  Scene, SRGBColorSpace, Texture, TextureLoader, Color, WebGLCubeRenderTarget, WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { EnvironmentData, WORLD_EYE_HEIGHT } from "@shared/types/environment";
import { loadCompressed } from "../../content/compressed";
import { contentUrl } from "../../content/game-config";

/** A cube face's size in pixels: the world model is seen from one point, a face covers 90° of the view */
const WORLD_FACE = 1024;
/** The world model's near and far planes from the reader's eye (metres) */
const NEAR = 0.05;
const FAR = 2000;

/** How the files are fetched – the tests pass their own */
export interface EnvironmentLoaders {
  /** An equirectangular image as a texture (sRGB) */
  sky(url: string): Promise<Texture>;
  /** A glTF model's scene */
  world(url: string): Promise<Object3D>;
}

let gltfLoader: GLTFLoader | null = null;

export const DEFAULT_ENVIRONMENT_LOADERS: EnvironmentLoaders = {
  sky: async url => {
    const texture = await new TextureLoader().setCrossOrigin("anonymous").loadAsync(url);
    texture.colorSpace = SRGBColorSpace;
    // Sampled by direction in the pass: no mipmaps, so the image's seam (behind the reader) shows no line
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    return texture;
  },
  world: async url => {
    if (!gltfLoader) {
      gltfLoader = new GLTFLoader();
      gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    }
    // .glb: the content build's gzip copy where there is one (as the scene's models); .gltf: its own files
    const gltf = /\.glb$/i.test(url.split(/[?#]/)[0])
      ? await gltfLoader.parseAsync(await loadCompressed(url), url.replace(/[^/?#]*([?#].*)?$/, ""))
      : await gltfLoader.loadAsync(url);
    return gltf.scene;
  },
};

/** Free what a loaded model holds on the GPU (the bake keeps only the cube) */
const disposeObject = (object: Object3D): void => {
  object.traverse(child => {
    if (!(child instanceof Mesh)) return;
    child.geometry.dispose();
    (Array.isArray(child.material) ? child.material : [child.material]).forEach((material: Material) => {
      Object.values(material).forEach(value => {
        if (value instanceof Texture) value.dispose();
      });
      material.dispose();
    });
  });
};

/**
 * The world model seen from the reader's eye, once, into a cube (`WORLD_FACE` per face, alpha 0 where nothing is):
 * the look-around pass then looks it up by direction like the built-in world – one full-screen pass, no scene drawn
 * per frame (RULES #4). The reader stands still in it (3DoF), so the cube is all of it; the model's animations are not
 * played. Lit by a sky light and a sun, and by the sky image where there is one.
 */
export const bakeWorld = (renderer: WebGLRenderer, world: Object3D, sky: Texture | null): WebGLCubeRenderTarget => {
  const target = new WebGLCubeRenderTarget(WORLD_FACE, { type: HalfFloatType });
  const scene = new Scene();
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-0.5, 1, 0.6);
  scene.add(new HemisphereLight(0xffffff, 0x404040, 1.4), sun, world);
  let lighting: Texture | null = null;
  if (sky) {
    lighting = sky.clone();
    lighting.mapping = EquirectangularReflectionMapping;
    lighting.needsUpdate = true;
    scene.environment = lighting;
  }
  const camera = new CubeCamera(NEAR, FAR, target);
  camera.position.set(0, WORLD_EYE_HEIGHT, 0);
  const clearColor = renderer.getClearColor(new Color());
  const clearAlpha = renderer.getClearAlpha();
  const renderTarget = renderer.getRenderTarget();
  renderer.setClearColor(0x000000, 0);
  camera.update(renderer, scene);
  renderer.setClearColor(clearColor, clearAlpha);
  renderer.setRenderTarget(renderTarget);
  scene.remove(world);
  lighting?.dispose();
  return target;
};

/**
 * The environment's assets for the look-around pass (content schema 2.10): the sky image and the world model baked
 * into a cube. `set()` loads what changed and frees what is no longer named; a newer `set()` wins over a load still
 * running. While an asset loads – or when it fails (logged) – the pass draws the built-in world's part instead.
 */
export class EnvironmentAssets {
  /** The sky image, null = the built-in world's sky */
  sky: Texture | null = null;
  /** The world model's cube, null = the built-in world's scenery */
  world: CubeTexture | null = null;
  /** Called when `sky` or `world` changed */
  onChange: () => void = () => {};

  private skySrc: string | null = null;
  private worldSrc: string | null = null;
  private worldTarget: WebGLCubeRenderTarget | null = null;
  private worldModel: Object3D | null = null;
  private disposed = false;

  /** `bake`: the world model into a cube (the tests pass their own – they have no WebGL) */
  constructor(
    renderer: WebGLRenderer,
    private loaders: EnvironmentLoaders = DEFAULT_ENVIRONMENT_LOADERS,
    private bakeModel: (world: Object3D, sky: Texture | null) => WebGLCubeRenderTarget = (world, sky) => bakeWorld(renderer, world, sky),
  ) {}

  /** Load the environment's assets (references as the content holds them, resolved with `contentUrl`) */
  set(environment: EnvironmentData): Promise<void> {
    const skySrc = environment.skySrc ? contentUrl(environment.skySrc) : null;
    const worldSrc = environment.worldSrc ? contentUrl(environment.worldSrc) : null;
    const tasks: Promise<void>[] = [];
    if (skySrc !== this.skySrc) {
      this.skySrc = skySrc;
      this.setSky(null);
      if (skySrc) tasks.push(this.loadSky(skySrc));
    }
    if (worldSrc !== this.worldSrc) {
      this.worldSrc = worldSrc;
      this.setWorld(null);
      if (this.worldModel) disposeObject(this.worldModel);
      this.worldModel = null;
      if (worldSrc) tasks.push(this.loadWorld(worldSrc));
    }
    return Promise.all(tasks).then(() => undefined);
  }

  dispose(): void {
    this.disposed = true;
    this.setSky(null);
    this.setWorld(null);
    if (this.worldModel) disposeObject(this.worldModel);
    this.worldModel = null;
  }

  private async loadSky(url: string): Promise<void> {
    try {
      const texture = await this.loaders.sky(url);
      if (this.disposed || this.skySrc !== url) {
        texture.dispose();
        return;
      }
      this.setSky(texture);
      // The world model is lit by the sky: bake it again
      if (this.worldModel) this.bake();
    } catch (error) {
      console.warn(`[look-around] The sky "${url}" could not be loaded – the built-in sky stays:`, error);
    }
  }

  private async loadWorld(url: string): Promise<void> {
    try {
      const model = await this.loaders.world(url);
      if (this.disposed || this.worldSrc !== url) {
        disposeObject(model);
        return;
      }
      this.worldModel = model;
      this.bake();
    } catch (error) {
      console.warn(`[look-around] The world "${url}" could not be loaded – the built-in world stays:`, error);
    }
  }

  private bake(): void {
    if (!this.worldModel) return;
    const target = this.bakeModel(this.worldModel, this.sky);
    this.worldTarget?.dispose();
    this.worldTarget = target;
    this.world = target.texture;
    this.onChange();
  }

  private setSky(texture: Texture | null): void {
    if (this.sky === texture) return;
    this.sky?.dispose();
    this.sky = texture;
    this.onChange();
  }

  private setWorld(texture: null): void {
    if (!this.world) return;
    this.worldTarget?.dispose();
    this.worldTarget = null;
    this.world = texture;
    this.onChange();
  }
}
