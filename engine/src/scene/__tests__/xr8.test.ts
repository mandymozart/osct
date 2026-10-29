import { describe, expect, it } from "vitest";
import { Matrix4, Quaternion, Vector3 } from "three";
import { anchorMatrix, targetFrame } from "../xr8";

describe("8th Wall image targets", () => {
  it("fits tall images whole into a 3:4 frame, padded left and right", () => {
    const frame = targetFrame(254, 650); // shadows – cropping kept only 52 % and it was not found
    expect(frame.crop).toEqual({ left: 0, top: 0, width: 488, height: 650, isRotated: false, originalWidth: 488, originalHeight: 650 });
    expect(frame.imageLeft).toBe(117);
    expect(frame.imageTop).toBe(0);
    expect(frame.widthFactor).toBeCloseTo(254 / 488);
  });

  it("fits wide portrait images padded above and below", () => {
    const frame = targetFrame(462, 567);
    expect(frame.crop).toMatchObject({ width: 462, height: 616 });
    expect(frame.imageTop).toBeCloseTo(24.5);
    expect(frame.widthFactor).toBe(1);
  });

  it("turns landscape images and relates the anchor to the whole width", () => {
    const frame = targetFrame(1200, 1047); // turned: 1047 wide, 1200 high → padded to 1047 × 1396
    expect(frame.crop).toMatchObject({ width: 1047, height: 1396, isRotated: true });
    expect(frame.widthFactor).toBeCloseTo(1200 / 1396); // on the page the frame's height is the width
    const wide = targetFrame(800, 200); // turned 200 × 800 → 600 × 800, the whole width is tracked
    expect(frame.crop.left).toBe(0);
    expect(wide.widthFactor).toBe(1);
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
