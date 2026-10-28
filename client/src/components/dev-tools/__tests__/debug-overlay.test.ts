import { afterEach, describe, expect, it } from "vitest";
import "../debug-overlay";

const expandedOf = (overlay: HTMLElement) => (overlay as unknown as { expanded: boolean }).expanded;

describe("debug overlay", () => {
  afterEach(() => document.body.replaceChildren());

  it("toggles once per tap after a disconnect and reconnect", async () => {
    const overlay = document.createElement("debug-overlay");
    document.body.appendChild(overlay);
    await Promise.resolve();
    overlay.remove();
    document.body.appendChild(overlay);
    await Promise.resolve();

    overlay.click();
    expect(expandedOf(overlay)).toBe(true);
    overlay.click();
    expect(expandedOf(overlay)).toBe(false);
  });
});
