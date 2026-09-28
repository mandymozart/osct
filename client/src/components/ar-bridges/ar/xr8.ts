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
 * The 3:4 frame (portrait) the engine reads for an image: the **whole** image, centred, landscape images turned
 * 90° clockwise first (`isRotated`); the rest is filled with the image's edge colour. (The image-target CLI crops
 * the centred 3:4 part instead – a tall page like `shadows`, 254×650, lost its distinctive top and bottom and
 * was not found, phone test 2026-09-28.) The engine gets the frame as an uncropped image.
 */
export interface TargetFrame {
  crop: XrCrop;
  /** Where the (turned) image lies in the frame, in image pixels */
  imageLeft: number;
  imageTop: number;
  /** Image width ÷ frame width, both as they lie on the page (the anchors use the image width) */
  widthFactor: number;
}

export const targetFrame = (imageWidth: number, imageHeight: number): TargetFrame => {
  const isRotated = imageWidth > imageHeight;
  const [width, height] = isRotated ? [imageHeight, imageWidth] : [imageWidth, imageHeight];
  const frameWidth = Math.max(width, Math.round((height * 3) / 4));
  const frameHeight = Math.max(height, Math.round((width * 4) / 3));
  return {
    crop: { left: 0, top: 0, width: frameWidth, height: frameHeight, isRotated, originalWidth: frameWidth, originalHeight: frameHeight },
    imageLeft: (frameWidth - width) / 2,
    imageTop: (frameHeight - height) / 2,
    widthFactor: imageWidth / (isRotated ? frameHeight : frameWidth),
  };
};

/** A target image prepared for the engine, plus the factor its anchors need */
export interface PreparedImageTarget {
  data: XrImageTargetData;
  widthFactor: number;
}

/** Mean colour of an image's outer pixel ring (fills the frame around it) */
const edgeColour = (context: CanvasRenderingContext2D, width: number, height: number): string => {
  const { data } = context.getImageData(0, 0, width, height);
  const sum = [0, 0, 0];
  let count = 0;
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2];
    count++;
  };
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 0; y < height; y++) { add(0, y); add(width - 1, y); }
  return `rgb(${sum.map(value => Math.round(value / count)).join(",")})`;
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64] = dataUrl.split(",");
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  return new Blob([bytes], { type: header.slice(5).split(";")[0] });
};

/**
 * Image target data for a target image: its frame as a grey 480×640 JPEG (object URL). The URL is also
 * the target's name – the engine unloads targets by the names it is given, which are their URLs.
 */
export const makeImageTarget = async (imageSrc: string): Promise<PreparedImageTarget> => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = imageSrc;
  await image.decode();
  const frame = targetFrame(image.naturalWidth, image.naturalHeight);
  const { crop } = frame;

  const turned = document.createElement("canvas");
  turned.width = crop.isRotated ? image.naturalHeight : image.naturalWidth;
  turned.height = crop.isRotated ? image.naturalWidth : image.naturalHeight;
  const turnedContext = turned.getContext("2d", { willReadFrequently: true })!;
  if (crop.isRotated) {
    turnedContext.translate(turned.width, 0);
    turnedContext.rotate(Math.PI / 2);
  }
  turnedContext.drawImage(image, 0, 0);

  const luminance = document.createElement("canvas");
  luminance.width = LUMINANCE_WIDTH;
  luminance.height = LUMINANCE_HEIGHT;
  const context = luminance.getContext("2d")!;
  context.fillStyle = edgeColour(turnedContext, turned.width, turned.height);
  context.fillRect(0, 0, LUMINANCE_WIDTH, LUMINANCE_HEIGHT);
  const scale = LUMINANCE_WIDTH / crop.width;
  context.drawImage(turned, frame.imageLeft * scale, frame.imageTop * scale, turned.width * scale, turned.height * scale);
  const pixels = context.getImageData(0, 0, LUMINANCE_WIDTH, LUMINANCE_HEIGHT);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = y;
  }
  context.putImageData(pixels, 0, 0);
  // toDataURL, not toBlob: Chrome encodes toBlob in idle time, and the engine's frame loop leaves almost none
  // (S22: ~4 s per image while tracking, 12 ms synchronously)
  const url = URL.createObjectURL(dataUrlToBlob(luminance.toDataURL("image/jpeg", 0.92)));
  return { data: { type: "PLANAR", name: url, imagePath: url, metadata: null, properties: crop }, widthFactor: frame.widthFactor };
};

const cameraInverse = new Matrix4();
const pose = new Matrix4();

/**
 * A found image's anchor relative to the camera of the frame: 1 unit = full image width, origin in the image's
 * centre (the convention the entities are placed in, `entities.ts`). World tracking is off, so only this relative
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
