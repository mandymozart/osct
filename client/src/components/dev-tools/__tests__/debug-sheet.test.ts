import { describe, expect, it } from "vitest";
import { debugSwitch, SWITCH_CSS } from "../debug-sheet";

const render = (html: string) => {
  const box = document.createElement("div");
  box.innerHTML = html;
  return box.querySelector("button")!;
};

describe("debugSwitch (#241)", () => {
  it("is a button with the switch role whose aria-checked follows the state", () => {
    const on = render(debugSwitch("ask zoom", true, "ask-zoom", "Ask for zoom on the next start"));
    expect(on.getAttribute("role")).toBe("switch");
    expect(on.getAttribute("aria-checked")).toBe("true");
    expect(on.dataset.action).toBe("ask-zoom");
    expect(on.getAttribute("aria-label")).toBe("Ask for zoom on the next start");
    expect(on.textContent).toBe("ask zoom");
    expect(on.querySelector(".track")).not.toBeNull();
    expect(render(debugSwitch("QR", false, "toggle-qr")).getAttribute("aria-checked")).toBe("false");
  });

  it("escapes its words, so a label cannot break out of the markup", () => {
    const button = render(debugSwitch('a "b" <i>', false, "x"));
    expect(button.textContent).toBe('a "b" <i>');
    expect(button.querySelector("i")).toBeNull();
  });
});

describe("SWITCH_CSS: the editor's switch shape in the debug green (#243)", () => {
  it("is a track with a knob that slides right and fills the track while on – no on / off text", () => {
    expect(SWITCH_CSS).toMatch(/\.track \{[^}]*width: 1\.875rem; height: 1\.125rem;/);
    expect(SWITCH_CSS).toMatch(/\.track::before \{[^}]*width: \.75rem; height: \.75rem;/);
    expect(SWITCH_CSS).toMatch(/\[aria-checked="true"\] \.track \{ background: #0f0; \}/);
    expect(SWITCH_CSS).toMatch(/\[aria-checked="true"\] \.track::before \{[^}]*translate\(\.875rem, -50%\)/);
  });

  it("shows its focus on the track and dims when disabled", () => {
    expect(SWITCH_CSS).toMatch(/:focus-visible \.track \{ outline:/);
    expect(SWITCH_CSS).toMatch(/:disabled \{ opacity: \.45; cursor: not-allowed; \}/);
  });
});
