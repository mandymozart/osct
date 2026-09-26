import { describe, expect, it, vi } from "vitest";
import ".."; // registers <gold-switch>
import { GoldSwitch } from "../gold-switch";

describe("<gold-switch>", () => {
  const mount = (html: string) => {
    document.body.innerHTML = html;
    return document.body.querySelector<GoldSwitch>("gold-switch")!;
  };
  const input = (element: GoldSwitch) => element.shadowRoot!.querySelector("input")!;

  it("is a labelled native switch: text left, switch right", () => {
    const element = mount(`<gold-switch label="Updates" checked></gold-switch>`);
    expect(input(element).getAttribute("role")).toBe("switch");
    expect(input(element).checked).toBe(true);
    expect(element.shadowRoot!.querySelector("label")!.textContent).toBe("Updates");
    expect(element.shadowRoot!.querySelector("label > span + input")).not.toBeNull();
  });

  it("a tap toggles it and fires change on the element", () => {
    const element = mount(`<gold-switch label="Updates"></gold-switch>`);
    const listener = vi.fn();
    document.body.addEventListener("change", listener);
    input(element).click();
    expect(element.checked).toBe(true);
    expect(element.hasAttribute("checked")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("change", listener);
  });

  it("follows its attributes", () => {
    const element = mount(`<gold-switch label="A"></gold-switch>`);
    element.setAttribute("disabled", "");
    element.checked = true;
    element.setAttribute("label", "B");
    expect(input(element).disabled).toBe(true);
    expect(input(element).checked).toBe(true);
    expect(element.shadowRoot!.textContent).toContain("B");
  });
});
