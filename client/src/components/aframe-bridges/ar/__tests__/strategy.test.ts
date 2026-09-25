import { describe, expect, it, vi } from "vitest";
import { AR_SCENE_STRATEGY, resolveArSceneStrategy } from "../index";

const storage = (value: string | null) => ({ getItem: () => value });

describe("AR scene strategy", () => {
  it("defaults to the constant", () => {
    expect(resolveArSceneStrategy({ DEV: false }, null)).toBe(AR_SCENE_STRATEGY);
  });

  it("uses the build flag VITE_AR_STRATEGY", () => {
    expect(resolveArSceneStrategy({ DEV: false, VITE_AR_STRATEGY: "persistent" }, null)).toBe("persistent");
    expect(resolveArSceneStrategy({ DEV: false, VITE_AR_STRATEGY: " rebuild " }, null)).toBe("rebuild");
  });

  it("lets the dev override win over the build flag – in dev builds only", () => {
    const env = { VITE_AR_STRATEGY: "rebuild" };
    expect(resolveArSceneStrategy({ ...env, DEV: true }, storage("persistent"))).toBe("persistent");
    expect(resolveArSceneStrategy({ ...env, DEV: false }, storage("persistent"))).toBe("rebuild");
  });

  it("ignores unknown values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveArSceneStrategy({ DEV: true, VITE_AR_STRATEGY: "hologram" }, storage("fast"))).toBe(AR_SCENE_STRATEGY);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
