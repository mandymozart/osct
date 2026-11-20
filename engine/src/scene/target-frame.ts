/**
 * The frame the 8th Wall engine reads for a target image (the format of 8th Wall's image-target CLI, flat): geometry
 * and size only, no DOM and no three.js – the reader (`xr8.ts`) and `osct targets prepare` (`scripts/src/lib/recognition.ts`,
 * Node) make the same frame from it.
 */

/** Size of the luminance image the engine reads (image-target CLI: 480×640, grey) */
export const LUMINANCE_WIDTH = 480;
export const LUMINANCE_HEIGHT = 640;

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

/**
 * The 3:4 frame (portrait) the engine reads for an image: the **whole** image, centred, landscape images turned
 * 90° clockwise first (`isRotated`); the rest is filled with the image's edge colour. (Cropping to the centred
 * 3:4 part instead loses the top and bottom of a tall page, which is then not recognised – the image-target CLI's
 * default crop does that.) The engine gets the frame as an uncropped image.
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

/** Grey value of an RGB pixel (Rec. 601 – what both paths write) */
export const luma = (r: number, g: number, b: number): number => Math.round(0.299 * r + 0.587 * g + 0.114 * b);
