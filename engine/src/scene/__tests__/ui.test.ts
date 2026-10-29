import { describe, expect, it } from "vitest";
import { onAppUi } from "../ui";

describe("onAppUi", () => {
  /** Whether a pointerdown on the element is UI (the path exists only while the event is dispatched) */
  const uiAt = (target: Element): boolean => {
    let ui: boolean | null = null;
    target.addEventListener("pointerdown", event => { ui = onAppUi(event); });
    target.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    return ui!;
  };

  it("counts controls and everything inside a data-app-ui region as UI, nothing else", () => {
    document.body.innerHTML = `
      <button><span class="label">ok</span></button>
      <aside data-app-ui><div><p class="text">panel</p></div></aside>
      <div class="stage"><canvas></canvas></div>`;
    expect(uiAt(document.querySelector(".label")!)).toBe(true);
    expect(uiAt(document.querySelector(".text")!)).toBe(true);
    expect(uiAt(document.querySelector("canvas")!)).toBe(false);
  });
});
