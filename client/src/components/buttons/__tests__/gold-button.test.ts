import { describe, expect, it } from "vitest";
import { goldButton } from "../gold-button";

describe("goldButton", () => {
  it("renders a native design button with a gold label (pill by default)", () => {
    expect(goldButton({ label: "Entries" })).toBe(`<button type="button" class="pill design"><span class="gold">Entries</span></button>`);
  });

  it("maps shapes and the primary modifier to the design classes", () => {
    expect(goldButton({ label: "Start", shape: "button", primary: true })).toContain(`class="button primary design"`);
    expect(goldButton({ label: "i", shape: "icon", className: "info" })).toContain(`class="icon-button design info"`);
  });

  it("writes attributes: strings escaped, true without value, false and undefined left out", () => {
    const html = goldButton({ label: "Resume", attrs: { "data-action": "resume", hidden: true, "aria-pressed": false, id: undefined, title: `"x"` } });
    expect(html).toContain(` data-action="resume" hidden title="&quot;x&quot;">`);
    expect(html).not.toContain("aria-pressed");
    expect(html).not.toContain("id=");
  });

  it("escapes the label", () => {
    expect(goldButton({ label: "<Resume>" })).toContain(`<span class="gold">&lt;Resume&gt;</span>`);
  });
});
