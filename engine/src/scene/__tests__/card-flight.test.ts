import { describe, expect, it } from "vitest";
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { bendAt, CARD_FILL, cardPose, easeInOutCubic, endDistance, IMPACT_MS, impactAt, pathProgress, startFromAnchor } from "../card-flight";

/** A camera at the origin like the tracker's: 60° vertical, portrait 9:16 */
const camera = () => {
  const c = new PerspectiveCamera(60, 9 / 16, 0.01, 100);
  c.updateProjectionMatrix();
  c.updateMatrixWorld();
  return c;
};

/** A page 2 units below and in front of the camera, tilted towards it, image 0.4 wide */
const anchor = () =>
  new Matrix4().compose(new Vector3(0.1, -0.5, -2), new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.6), new Vector3(0.4, 0.4, 0.4));

describe("card flight (#285)", () => {
  it("starts where the picture lies on the page", () => {
    const start = startFromAnchor(anchor());
    const { position, rotation } = cardPose(start, camera(), 1.25, 0);
    expect(position.distanceTo(new Vector3(0.1, -0.5, -2))).toBeLessThan(1e-9);
    expect(rotation.angleTo(start.rotation)).toBeLessThan(1e-9);
    expect(start.width).toBeCloseTo(0.4);
    expect(start.normal.z).toBeCloseTo(Math.cos(0.6));
  });

  it("lands dead centre, facing the reader, and fills CARD_FILL of the screen", () => {
    const c = camera();
    const start = startFromAnchor(anchor());
    const aspect = 1.25; // a portrait picture
    const { position, rotation } = cardPose(start, c, aspect, 1);
    const d = endDistance(c.projectionMatrix, start.width, aspect);
    expect(position.x).toBeCloseTo(0);
    expect(position.y).toBeCloseTo(0);
    expect(position.z).toBeCloseTo(-d);
    // A full turn about its horizontal axis ends where it began: facing the camera
    expect(rotation.angleTo(c.quaternion)).toBeLessThan(1e-6);
    // The card's projected width / height: the tighter of the two is CARD_FILL of the screen
    const tanV = Math.tan((60 * Math.PI) / 360);
    const tanH = tanV * (9 / 16);
    const fillW = start.width / (2 * d * tanH);
    const fillH = (start.width * aspect) / (2 * d * tanV);
    expect(Math.max(fillW, fillH)).toBeCloseTo(CARD_FILL);
  });

  it("spins about its vertical axis: the back faces the reader halfway through the spin", () => {
    const c = camera();
    const start = startFromAnchor(new Matrix4()); // a page facing the camera squarely
    const { rotation } = cardPose(start, c, 1, 0.51);
    const normal = new Vector3(0, 0, 1).applyQuaternion(rotation);
    expect(normal.z).toBeLessThan(-0.95);
  });

  it("slaps: fastest right at the screen, a hover between rise and spin", () => {
    const c = camera();
    const start = startFromAnchor(anchor());
    const step = (t: number) => cardPose(start, c, 1, t).position.distanceTo(cardPose(start, c, 1, t - 0.02).position);
    expect(step(1)).toBeGreaterThan(3 * step(0.5));
    expect(step(0.29)).toBeLessThan(step(0.15));
    expect(pathProgress(0)).toBe(0);
    expect(pathProgress(1)).toBeCloseTo(1);
  });

  it("bends off the page first, stiff by the end of the rise", () => {
    expect(bendAt(0)).toBe(0);
    expect(bendAt(0.1)).toBeGreaterThan(0.95);
    expect(bendAt(0.28)).toBeCloseTo(0);
    expect(bendAt(0.6)).toBeCloseTo(0);
  });

  it("the impact flashes and settles within IMPACT_MS", () => {
    expect(impactAt(0).flash).toBe(0);
    expect(impactAt(50).flash).toBeCloseTo(1);
    expect(impactAt(0).push).toBeGreaterThan(0.05);
    const after = impactAt(IMPACT_MS);
    expect([after.push, after.flash, ...after.shake]).toEqual([0, 0, 0, 0]);
  });

  it("rises off the page first (the path leaves along the page's normal)", () => {
    const c = camera();
    const start = startFromAnchor(anchor());
    const early = cardPose(start, c, 1, 0.08).position.sub(start.position).normalize();
    expect(early.dot(start.normal)).toBeGreaterThan(0.8);
  });

  it("keeps the card beyond the near plane", () => {
    const c = new PerspectiveCamera(60, 1, 0.5, 100);
    c.updateProjectionMatrix();
    expect(endDistance(c.projectionMatrix, 0.01, 1)).toBeCloseTo(0.75);
  });

  it("easing hits its ends", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });
});
