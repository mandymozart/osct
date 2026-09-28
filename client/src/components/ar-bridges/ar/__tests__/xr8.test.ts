import { describe, expect, it } from "vitest";
import { Matrix4, Quaternion, Vector3 } from "three";
import { anchorMatrix, defaultCrop, fullWidthFactor } from "../xr8";

describe("8th Wall image targets", () => {
  it("crops tall images to the centred 3:4 part and keeps their width", () => {
    const crop = defaultCrop(254, 650);
    expect(crop).toEqual({ left: 0, top: 156, width: 254, height: 339, isRotated: false, originalWidth: 254, originalHeight: 650 });
    expect(fullWidthFactor(crop)).toBe(1);
  });

  it("turns landscape images and relates the anchor to the whole width", () => {
    const crop = defaultCrop(1200, 1047); // turned: 1047 wide, 1200 high → 3:4 from the middle
    expect(crop.isRotated).toBe(true);
    expect(crop).toMatchObject({ width: 900, height: 1200, left: 74, top: 0 });
    expect(fullWidthFactor(crop)).toBe(1); // turned back, the crop keeps the full width (1200)
    const wide = defaultCrop(800, 200); // turned 200 × 800 – only 267 of 800 px of the width are tracked
    expect(fullWidthFactor(wide)).toBeCloseTo(800 / 267);
  });

  it("gives the image's pose relative to the camera, scaled to the full image width", () => {
    const camera = { position: { x: 0, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: -Math.SQRT1_2 } };
    const image = {
      name: "a",
      position: { x: 0, y: 2, z: -0.8 },
      rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: -Math.SQRT1_2 },
      scale: 0.6,
      scaledWidth: 0.75,
      scaledHeight: 1,
    };
    const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
    anchorMatrix(camera, image, 2).decompose(position, rotation, scale);
    expect(position.x).toBeCloseTo(0);
    expect(position.y).toBeCloseTo(0);
    expect(position.z).toBeCloseTo(-0.8);
    expect(rotation.angleTo(new Quaternion())).toBeCloseTo(0); // facing the camera, upright on screen
    expect(scale.x).toBeCloseTo(0.6 * 0.75 * 2);
    expect(anchorMatrix(camera, image, 2)).toBeInstanceOf(Matrix4);
  });
});
