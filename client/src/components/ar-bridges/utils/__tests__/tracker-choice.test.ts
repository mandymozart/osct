import { afterEach, describe, expect, it, vi } from "vitest";
import { cyclePreparedSpreadRange, getPreparedSpreadRange, getTrackerEngine, setTrackerEngine } from "../tracker-choice";

describe("tracker choice", () => {
  afterEach(() => {
    setTrackerEngine(null);
    vi.unstubAllEnvs();
  });

  it("uses MindAR unless the build flag or the device says otherwise", () => {
    expect(getTrackerEngine()).toBe("mindar");
    vi.stubEnv("VITE_AR_TRACKER", "8thwall");
    expect(getTrackerEngine()).toBe("8thwall");
    vi.stubEnv("VITE_AR_TRACKER", "unknown");
    expect(getTrackerEngine()).toBe("mindar");
  });

  it("lets the device override the build flag until it is cleared", () => {
    vi.stubEnv("VITE_AR_TRACKER", "mindar");
    setTrackerEngine("8thwall");
    expect(getTrackerEngine()).toBe("8thwall");
    setTrackerEngine(null);
    expect(getTrackerEngine()).toBe("mindar");
  });

  it("keeps the neighbours loaded by default and cycles the load-test range through to the whole book", () => {
    localStorage.removeItem("osct-ar-prepared-spreads");
    expect(getPreparedSpreadRange()).toBe(1);
    expect([cyclePreparedSpreadRange(), cyclePreparedSpreadRange(), cyclePreparedSpreadRange()]).toEqual([2, Infinity, 0]);
    expect(localStorage.getItem("osct-ar-prepared-spreads")).toBe("0");
    localStorage.setItem("osct-ar-prepared-spreads", "7");
    expect(getPreparedSpreadRange()).toBe(1);
    localStorage.removeItem("osct-ar-prepared-spreads");
  });
});
