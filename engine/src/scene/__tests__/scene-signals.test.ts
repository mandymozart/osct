import { describe, expect, it } from "vitest";
import { Matrix4 } from "three";
import { type ArError, ArSceneError, ErrorCode, SceneState, type Target } from "../../types/index";
import { ArScene } from "../ar-scene";

const target: Target = { id: "page", entryId: "page", spreadId: "s", imageSrc: "/page.jpg" };

interface Internals {
  content: unknown;
  view: unknown;
  tracker: unknown;
  wantedSpread: string | null;
  started: boolean;
  stale: boolean;
  changeSpread(spreadId: string): Promise<void>;
  onTrackingUpdate(targetId: string, matrix: Matrix4 | null): void;
  run(): Promise<void>;
  pause(): void;
}

/** A scene with the spread `s` loaded – without renderer or camera – and what it tells the app */
const sceneWith = (tracker: unknown) => {
  const scene = new ArScene(document.createElement("div"), { createTracker: () => { throw new Error("no tracker in this test"); } });
  const internals = scene as unknown as Internals;
  internals.content = { spreadId: "s", targets: [target], anchors: [{ target, group: { visible: false, matrix: new Matrix4() }, entity: null }] };
  internals.view = { resize: () => {}, start: () => {}, stop: () => {} };
  internals.tracker = tracker;
  internals.wantedSpread = "s";
  const scanning: boolean[] = [];
  const errors: Array<ArError | undefined> = [];
  scene.on("scanning", on => scanning.push(on));
  scene.on("status", (status, error) => { if (status === "error") errors.push(error); });
  return { scene, internals, scanning, errors };
};

const failingStart = (error: unknown) => ({ startCamera: () => Promise.reject(error), stop: () => {} });

describe("ArScene: what the app is told", () => {
  it("scanning while tracking runs and nothing is found – the app shows its own indicator", async () => {
    const { internals, scanning } = sceneWith({ resume: () => {}, pause: () => {}, stop: () => {} });
    internals.started = true;
    await internals.run();
    internals.onTrackingUpdate("page", new Matrix4());
    internals.onTrackingUpdate("page", new Matrix4());
    internals.onTrackingUpdate("page", null);
    internals.pause();
    expect(scanning).toEqual([true, false, true, false]);
  });

  it("a camera that sends no picture is reported with its code", async () => {
    const { scene, errors } = sceneWith(failingStart(new ArSceneError(ErrorCode.CAMERA_NOT_RESPONDING, "camera not responding (no picture after 10 s)")));
    await scene.setState(SceneState.RUNNING);
    expect(errors).toEqual([{ code: ErrorCode.CAMERA_NOT_RESPONDING, message: "AR could not start: camera not responding (no picture after 10 s)" }]);
    expect(scene.status).toBe("error");
  });

  it("any other start failure (denied, unavailable) is a failed start", async () => {
    const { scene, errors } = sceneWith(failingStart(new Error("Camera unavailable: NotAllowedError")));
    await scene.setState(SceneState.RUNNING);
    expect(errors).toEqual([{ code: ErrorCode.AR_START_FAILED, message: "AR could not start: Camera unavailable: NotAllowedError" }]);
  });

  it("a failure outside the start is the scene's", async () => {
    const { scene, internals, errors } = sceneWith(failingStart(new Error("unused")));
    internals.stale = true;
    internals.changeSpread = () => Promise.reject(new Error("the spread could not be built"));
    await scene.setState(SceneState.RUNNING);
    expect(errors).toEqual([{ code: ErrorCode.AR_FAILED, message: "the spread could not be built" }]);
  });
});
