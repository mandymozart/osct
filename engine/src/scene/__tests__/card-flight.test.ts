import { describe, expect, it } from "vitest";
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { bendAt, bendPivotAt, flightMs, twistAt, CARD_FILL, cardPose, easeInOutCubic, endDistance, IMPACT_MS, impactAt, pathProgress, startFromAnchor } from "../card-flight";

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
    const { rotation } = cardPose(start, c, 1, 0.54);
    const normal = new Vector3(0, 0, 1).applyQuaternion(rotation);
    expect(normal.z).toBeLessThan(-0.95);
  });

  it("is paper until the spin is over: peels, then a convex bow that twists; a stiff card early in the slap", () => {
    expect(bendAt(0)).toBeCloseTo(0);
    expect(bendAt(0.08)).toBeGreaterThan(0.3);
    for (const t of [0.4, 0.5, 0.7, 0.79]) expect(bendAt(t)).toBeLessThan(-0.3);
    expect(bendPivotAt(0)).toBeCloseTo(0);
    expect(bendPivotAt(0.4)).toBe(1);
    expect(bendAt(0.9)).toBeCloseTo(0);
    expect(twistAt(0)).toBeCloseTo(0);
    expect(twistAt(0.1)).toBeGreaterThan(0);
    expect(Math.max(...[0.4, 0.5, 0.6].map(t => Math.abs(twistAt(t))))).toBeGreaterThan(0.3);
    expect(twistAt(0.9)).toBeCloseTo(0);
  });

  it("fluid: never stops before the slap, then accelerates into the screen", () => {
    const speed = (t: number) => (pathProgress(t + 0.005) - pathProgress(t - 0.005)) / 0.01;
    for (let t = 0.05; t < 0.99; t += 0.05) expect(speed(t)).toBeGreaterThan(0.1);
    expect(Math.abs(speed(0.795) - speed(0.805))).toBeLessThan(0.15);
    expect(speed(0.99)).toBeGreaterThan(2 * speed(0.79));
  });

  it("takes 0.8 s from a close page, up to 1.2 s from a far one", () => {
    const c = camera();
    const at = (z: number) => startFromAnchor(new Matrix4().compose(new Vector3(0, 0, -z), new Quaternion(), new Vector3(0.4, 0.4, 0.4)));
    const d = endDistance(c.projectionMatrix, 0.4, 1);
    expect(flightMs(at(d), c, 1)).toBeCloseTo(800);
    expect(flightMs(at(10 * d), c, 1)).toBeCloseTo(1200);
    const middle = flightMs(at(2 * d), c, 1);
    expect(middle).toBeGreaterThan(800);
    expect(middle).toBeLessThan(1200);
  });

  it("moves up the page first, before it rises off it", () => {
    const c = camera();
    const start = startFromAnchor(anchor());
    const pageUp = new Vector3(0, 1, 0).applyQuaternion(start.rotation);
    const early = cardPose(start, c, 1, 0.04).position.sub(start.position).normalize();
    expect(early.dot(pageUp)).toBeGreaterThan(0.7);
  });

  it("the impact pushes, bounces and settles within IMPACT_MS", () => {
    expect(impactAt(0).push).toBeGreaterThan(0.05);
    expect(impactAt(60).push).toBeLessThan(impactAt(0).push);
    const after = impactAt(IMPACT_MS);
    expect([after.push, ...after.shake]).toEqual([0, 0, 0]);
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
