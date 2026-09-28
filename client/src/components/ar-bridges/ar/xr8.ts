import { Matrix4, Quaternion, Vector3 } from "three";

/**
 * The 8th Wall engine (`@8thwall/engine`, MIT, image targets only – no SLAM): loader, the few types the app
 * uses, and image target data made from the target images at runtime (what 8th Wall's image-target CLI writes).
 * The engine's files are served from `assets/xr8/` (vite.config.js copies them from node_modules).
 */

export interface XrVector { x: number; y: number; z: number }
export interface XrQuaternion extends XrVector { w: number }

/** Crop of a target image, in the orientation the engine reads it (portrait, 3:4) */
export interface XrCrop {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Landscape image: turned 90° clockwise before cropping */
  isRotated: boolean;
  originalWidth: number;
  originalHeight: number;
}

export interface XrImageTargetData {
  type: "PLANAR";
  name: string;
  imagePath: string;
  metadata: null;
  properties: XrCrop;
}

/** `imagefound` / `imageupdated` / `imagelost` detail of a flat target */
export interface XrImageDetail {
  name: string;
  position: XrVector;
  rotation: XrQuaternion;
  scale: number;
  /** Size of the (cropped) image in its own frame, × scale – the longer side is 1 */
  scaledWidth: number;
  scaledHeight: number;
}

export interface XrReality {
  position: XrVector;
  rotation: XrQuaternion;
  intrinsics: number[] | null;
}

export interface XrPipelineModule {
  name: string;
  onStart?: (args: { canvasWidth: number; canvasHeight: number }) => void;
  onUpdate?: (args: { processCpuResult: { reality?: XrReality } }) => void;
  onCanvasSizeChange?: (args: { canvasWidth: number; canvasHeight: number }) => void;
  onCameraStatusChange?: (args: { status: string; reason?: string }) => void;
  onException?: (error: unknown) => void;
  listeners?: Array<{ event: string; process: (event: { detail: any }) => void }>;
}

export interface XR8Api {
  version(): string;
  loadChunk(chunk: string | { name: string; url: string }): Promise<void>;
  run(config: {
    canvas: HTMLCanvasElement;
    allowedDevices?: string;
    cameraConfig?: { direction: string };
  }): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  stop(): void;
  addCameraPipelineModules(modules: unknown[]): void;
  clearCameraPipelineModules(): void;
  GlTextureRenderer: { pipelineModule(): unknown };
  XrController: {
    pipelineModule(): unknown;
    configure(config: { disableWorldTracking?: boolean; imageTargetData?: XrImageTargetData[] }): void;
    updateCameraProjectionMatrix(config: {
      cam: { pixelRectWidth: number; pixelRectHeight: number; nearClipPlane: number; farClipPlane: number };
    }): void;
  } | null;
  XrConfig: { device(): { ANY: string }; camera(): { BACK: string } };
}

declare global {
  interface Window {
    XR8?: XR8Api;
  }
}

const XR8_BASE = `${import.meta.env.BASE_URL}assets/xr8/`;
const ENGINE_FILES = ["xr.js", "xr-tracking.js"];

let loading: Promise<XR8Api> | null = null;

/** Load the engine (script tag – it is not a module) and its image tracking chunk; retried after a failure */
export const loadXr8 = (): Promise<XR8Api> => {
  if (!loading) {
    loading = new Promise<XR8Api>((resolve, reject) => {
      if (window.XR8) return resolve(window.XR8);
      window.addEventListener("xrloaded", () => resolve(window.XR8!), { once: true });
      const script = document.createElement("script");
      script.src = `${XR8_BASE}xr.js`;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onerror = () => {
        script.remove();
        reject(new Error("The 8th Wall engine could not be loaded"));
      };
      document.head.appendChild(script);
    })
      .then(async XR8 => {
        await XR8.loadChunk({ name: "slam", url: new URL(`${XR8_BASE}xr-tracking.js`, location.href).href });
        if (!XR8.XrController) throw new Error("The 8th Wall engine has no image tracking (XrController)");
        return XR8;
      })
      .catch(error => {
        loading = null;
        throw error;
      });
  }
  return loading;
};

/** Fetch the engine's files into the HTTP cache (idle time; nothing is evaluated) */
export const prefetchXr8 = (): Promise<void> =>
  Promise.all(ENGINE_FILES.map(file => fetch(`${XR8_BASE}${file}`).then(response => response.blob()))).then(
    () => {},
    error => console.warn("[8th Wall] Could not prefetch the engine:", error),
  );

/** Size of the luminance image the engine reads (image-target CLI: 480×640, grey) */
const LUMINANCE_WIDTH = 480;
const LUMINANCE_HEIGHT = 640;

/**
 * The image-target CLI's default crop: the centred 3:4 part of the image, landscape images turned 90°
 * clockwise first (`isRotated`). The engine tracks only this part.
 */
export const defaultCrop = (imageWidth: number, imageHeight: number): XrCrop => {
  const isRotated = imageWidth > imageHeight;
  const [width, height] = isRotated ? [imageHeight, imageWidth] : [imageWidth, imageHeight];
  if (width / 3 > height / 4) {
    const cropWidth = Math.round((height * 3) / 4);
    return { left: Math.round((width - cropWidth) / 2), top: 0, width: cropWidth, height, isRotated, originalWidth: width, originalHeight: height };
  }
  const cropHeight = Math.round((width * 4) / 3);
  return { left: 0, top: Math.round((height - cropHeight) / 2), width, height: cropHeight, isRotated, originalWidth: width, originalHeight: height };
};

/**
 * Full image width ÷ tracked (cropped) width, both as the image lies on the page. The engine's pose is the
 * crop's; the app's anchors use the whole image (1 unit = image width, as with MindAR).
 */
export const fullWidthFactor = (crop: XrCrop): number =>
  crop.isRotated ? crop.originalHeight / crop.height : crop.originalWidth / crop.width;

/**
 * Image target data for a target image: the default crop as a grey 480×640 JPEG (object URL). The URL is also
 * the target's name – the engine unloads targets by the names it is given, which are their URLs.
 */
export const makeImageTarget = async (imageSrc: string): Promise<XrImageTargetData> => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = imageSrc;
  await image.decode();
  const crop = defaultCrop(image.naturalWidth, image.naturalHeight);

  const turned = document.createElement("canvas");
  turned.width = crop.originalWidth;
  turned.height = crop.originalHeight;
  const turnedContext = turned.getContext("2d")!;
  if (crop.isRotated) {
    turnedContext.translate(crop.originalWidth, 0);
    turnedContext.rotate(Math.PI / 2);
  }
  turnedContext.drawImage(image, 0, 0);

  const luminance = document.createElement("canvas");
  luminance.width = LUMINANCE_WIDTH;
  luminance.height = LUMINANCE_HEIGHT;
  const context = luminance.getContext("2d")!;
  context.drawImage(turned, crop.left, crop.top, crop.width, crop.height, 0, 0, LUMINANCE_WIDTH, LUMINANCE_HEIGHT);
  const pixels = context.getImageData(0, 0, LUMINANCE_WIDTH, LUMINANCE_HEIGHT);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = y;
  }
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    luminance.toBlob(b => (b ? resolve(b) : reject(new Error(`Could not prepare ${imageSrc}`))), "image/jpeg", 0.92),
  );
  const url = URL.createObjectURL(blob);
  return { type: "PLANAR", name: url, imagePath: url, metadata: null, properties: crop };
};

const cameraInverse = new Matrix4();
const pose = new Matrix4();

/**
 * A found image's anchor relative to the camera of the frame: 1 unit = full image width, origin in the image's
 * centre (the MindAR convention the entities are placed in). World tracking is off, so only this relative
 * pose matters – the three.js camera stays at the origin.
 */
export const anchorMatrix = (camera: Pick<XrReality, "position" | "rotation">, image: XrImageDetail, widthFactor: number): Matrix4 => {
  const { position: p, rotation: r } = camera;
  cameraInverse.compose(new Vector3(p.x, p.y, p.z), new Quaternion(r.x, r.y, r.z, r.w), new Vector3(1, 1, 1)).invert();
  const scale = image.scale * image.scaledWidth * widthFactor;
  pose.compose(
    new Vector3(image.position.x, image.position.y, image.position.z),
    new Quaternion(image.rotation.x, image.rotation.y, image.rotation.z, image.rotation.w),
    new Vector3(scale, scale, scale),
  );
  return new Matrix4().multiplyMatrices(cameraInverse, pose);
};
