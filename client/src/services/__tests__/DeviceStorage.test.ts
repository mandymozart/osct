import { afterEach, describe, expect, it } from "vitest";
import { setDeviceStorage } from "@engine/utils/device-storage";
import { getAskZoom, getCameraResolution, getLensChoice, setLensChoice } from "@engine/utils/camera-request";
import { cyclePreparedSpreadRange, getStoredWindowSetting } from "@engine/utils/prepared-spreads";
import { LocalDeviceStorage } from "../DeviceStorage";

describe("LocalDeviceStorage", () => {
  afterEach(() => {
    localStorage.clear();
    setDeviceStorage(null);
  });

  it("keeps the engine's switches under the reader's keys", () => {
    localStorage.setItem("osct-camera-lens", "browser");
    localStorage.setItem("osct-camera-resolution", "1920x1440");
    localStorage.setItem("osct-camera-ask-zoom", "true");
    localStorage.setItem("osct-ar-prepared-spreads", "grow");
    setDeviceStorage(new LocalDeviceStorage());

    expect(getLensChoice()).toBe("browser");
    expect(getCameraResolution()).toEqual({ width: 1920, height: 1440 });
    expect(getAskZoom()).toBe(true);
    expect(getStoredWindowSetting()).toBe("grow");

    setLensChoice("main");
    expect(localStorage.getItem("osct-camera-lens")).toBeNull();
    cyclePreparedSpreadRange();
    expect(localStorage.getItem("osct-ar-prepared-spreads")).toBe("0");
  });
});
