import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameStore } from "@/store/GameStore";
import { CameraPermissionStatus } from "@/types";

describe("CameraManager", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("reports the camera as unavailable without a camera API (http on a network address)", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined });
    const game = createGameStore();
    expect(await game.camera.requestAccess()).toBe(false);
    expect(game.state.cameraPermission).toBe(CameraPermissionStatus.UNAVAILABLE);
    expect(await game.camera.checkPermission()).toBe(false);
  });

  it("reports a browser without WebAssembly SIMD (iOS before 16.4) as unsupported, without asking for the camera", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    vi.stubGlobal("WebAssembly", { ...WebAssembly, validate: () => false });
    const game = createGameStore();
    expect(await game.camera.checkPermission()).toBe(false);
    expect(game.state.cameraPermission).toBe(CameraPermissionStatus.UNSUPPORTED);
    expect(await game.camera.requestAccess()).toBe(false);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("grants access when the browser returns a stream", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    const game = createGameStore();
    expect(await game.camera.requestAccess()).toBe(true);
    expect(game.state.cameraPermission).toBe(CameraPermissionStatus.GRANTED);
    expect(stop).toHaveBeenCalled();
  });
});
