import { describe, expect, it } from "vitest";
import { goldButton, goldButtonContent } from "../gold-button";

describe("goldButton", () => {
  it("renders a native design button with a gold label (pill by default)", () => {
    expect(goldButton({ label: "Entries" })).toBe(`<button type="button" class="pill design"><span class="gold">Entries</span></button>`);
  });

  it("maps shapes and the primary modifier to the design classes", () => {
    expect(goldButton({ label: "Start", shape: "button", primary: true })).toContain(`class="button primary design"`);
    expect(goldButton({ label: "i", shape: "icon", className: "info" })).toContain(`class="icon-button design info"`);
  });

  it("writes attributes: strings escaped, true without value, false and undefined left out", () => {
    const html = goldButton({ label: "Add note", attrs: { "data-action": "add-note", hidden: true, "aria-pressed": false, id: undefined, title: `"x"` } });
    expect(html).toContain(` data-action="add-note" hidden title="&quot;x&quot;">`);
    expect(html).not.toContain("aria-pressed");
    expect(html).not.toContain("id=");
  });

  it("escapes the label and puts a trusted icon before it", () => {
    expect(goldButtonContent({ label: "<Resume>", icon: "<svg></svg>" })).toBe(`<svg></svg><span class="gold">&lt;Resume&gt;</span>`);
  });
});
