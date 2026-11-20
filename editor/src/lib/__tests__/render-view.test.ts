import { describe, expect, it } from "vitest";
import { markRender, renderRequest, renderState } from "../render-view";

describe("render view (#89)", () => {
  it("is asked for with ?render, its value a view preset (else the reader's view)", () => {
    expect(renderRequest(new URLSearchParams(""))).toBeNull();
    expect(renderRequest(new URLSearchParams("tab=code"))).toBeNull();
    expect(renderRequest(new URLSearchParams("render"))).toEqual({ view: "reader" });
    expect(renderRequest(new URLSearchParams("render=top"))).toEqual({ view: "top" });
    expect(renderRequest(new URLSearchParams("render=far"))).toEqual({ view: "far" });
    expect(renderRequest(new URLSearchParams("render=sideways"))).toEqual({ view: "reader" });
  });

  it("is ready once the stage runs, an error wins", () => {
    expect(renderState(undefined, null)).toBe("loading");
    expect(renderState("loading", null)).toBe("loading");
    expect(renderState("starting", null)).toBe("loading");
    expect(renderState("running", null)).toBe("ready");
    expect(renderState("paused", null)).toBe("ready");
    expect(renderState("error", null)).toBe("error");
    expect(renderState("running", "No scene x")).toBe("error");
  });

  it("writes the state and an error's words on the root", () => {
    const root = { dataset: {} as DOMStringMap } as HTMLElement;
    markRender("error", "boom", root);
    expect(root.dataset).toEqual({ osctRender: "error", osctRenderError: "boom" });
    markRender("ready", null, root);
    expect(root.dataset).toEqual({ osctRender: "ready" });
  });
});
