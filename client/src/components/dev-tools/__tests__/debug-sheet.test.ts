import { describe, expect, it } from "vitest";
import { debugSwitch } from "../debug-sheet";

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
