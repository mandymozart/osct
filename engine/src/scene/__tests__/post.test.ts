import { afterEach, describe, expect, it, vi } from "vitest";
import { Vector2 } from "three";
import { passContext, passRegistration, registeredPassTypes, registerPass, unregisterPassesOf } from "../post/registry";
import "../post/index";

/** A pass of a plugin's own: three's Pass shape without a renderer */
const fakePass = () => ({ enabled: true, needsSwap: true, clear: false, renderToScreen: false, setSize: vi.fn(), render: vi.fn(), dispose: vi.fn() });

describe("the pass registry", () => {
  afterEach(() => unregisterPassesOf("plugin"));

  it("has the built-in passes registered for the engine", () => {
    expect(registeredPassTypes()).toEqual(expect.arrayContaining(["bloom", "vignette", "grade"]));
    expect(passRegistration("bloom")?.owner).toBe("engine");
  });

  it("a plugin registers its own pass and leaves with it", () => {
    const spec = { description: "", params: { amount: { kind: "number" as const, default: 0.5, min: 0, max: 1, description: "" } } };
    const factory = vi.fn(() => fakePass() as never);
    registerPass("mine", spec, factory, "plugin");
    const registration = passRegistration("mine")!;
    expect(registration.owner).toBe("plugin");
    const context = passContext(registration, { type: "mine" }, new Vector2(300, 200), 2);
    expect(context.params).toEqual({ amount: 0.5 });
    expect(context.size.x).toBe(300);
    expect(context.pixelRatio).toBe(2);
    expect(typeof context.three.Vector2).toBe("function");
    unregisterPassesOf("plugin");
    expect(passRegistration("mine")).toBeUndefined();
    expect(passRegistration("bloom")).toBeDefined();
  });

  it("refuses a type another owner holds, lets the owner replace its own", () => {
    const spec = { description: "", params: {} };
    expect(() => registerPass("bloom", spec, () => fakePass() as never, "plugin")).toThrow(/registered by engine/);
    registerPass("mine", spec, () => fakePass() as never, "plugin");
    expect(() => registerPass("mine", spec, () => fakePass() as never, "plugin")).not.toThrow();
  });

  it("resolves the content's values over the spec's defaults", () => {
    const registration = passRegistration("vignette")!;
    expect(passContext(registration, { type: "vignette", strength: 0.2 }, new Vector2(1, 1), 1).params).toEqual({ strength: 0.2, radius: 0.6, softness: 0.6, color: "#000000" });
  });
});
