import { beforeEach, describe, expect, it } from "vitest";
import "../scrub-number";
import type { ScrubNumber } from "../scrub-number";

const make = (attrs: Record<string, string>): ScrubNumber => {
  const element = document.createElement("scrub-number") as ScrubNumber;
  Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
  document.body.appendChild(element);
  return element;
};

const input = (element: ScrubNumber) => element.shadowRoot!.querySelector("input")!;
const frame = (element: ScrubNumber) => element.shadowRoot!.querySelector<HTMLElement>(".frame")!;
const pointer = (type: string, x: number, extra: PointerEventInit = {}) =>
  new PointerEvent(type, { pointerId: 1, clientX: x, button: 0, bubbles: true, ...extra });

describe("<scrub-number>", () => {
  let events: string[];

  beforeEach(() => {
    document.body.innerHTML = "";
    events = [];
  });

  it("shows the value with the step's decimals and the unit", () => {
    const element = make({ value: "0.30000000000000004", step: "0.01", unit: "°" });
    expect(input(element).value).toBe("0.3");
    expect(element.shadowRoot!.querySelector(".unit")!.textContent).toBe("°");
  });

  it("scrubs by the step per few pixels, Shift ×10, and reports input then change", () => {
    const element = make({ value: "1", step: "0.1", default: "1" });
    element.addEventListener("input", () => events.push("input"));
    element.addEventListener("change", () => events.push("change"));
    const box = frame(element);
    box.dispatchEvent(pointer("pointerdown", 100));
    box.dispatchEvent(pointer("pointermove", 102)); // below the drag threshold: nothing yet
    expect(events).toEqual([]);
    box.dispatchEvent(pointer("pointermove", 120)); // 20 px = 10 steps
    expect(element.value).toBeCloseTo(2, 6);
    box.dispatchEvent(pointer("pointermove", 140, { shiftKey: true })); // 40 px = 20 steps × 10
    expect(element.value).toBeCloseTo(21, 6);
    box.dispatchEvent(pointer("pointerup", 140));
    expect(events[0]).toBe("input");
    expect(events[events.length - 1]).toBe("change");
    expect(element.shadowRoot!.querySelector<HTMLElement>(".reset")!.hidden).toBe(false);
  });

  it("a tap focuses the field for typing; Enter commits, Escape reverts", () => {
    const element = make({ value: "5", step: "1" });
    element.addEventListener("change", () => events.push("change"));
    const box = frame(element);
    box.dispatchEvent(pointer("pointerdown", 50));
    box.dispatchEvent(pointer("pointerup", 50));
    expect(document.activeElement === element).toBe(true);
    input(element).value = "7,5";
    input(element).dispatchEvent(new Event("input"));
    expect(element.value).toBe(7.5);
    input(element).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(events).toEqual(["change"]);
    expect(input(element).value).toBe("8"); // shown with the step's decimals (0)
    expect(element.value).toBe(7.5);

    box.dispatchEvent(pointer("pointerdown", 50));
    box.dispatchEvent(pointer("pointerup", 50));
    input(element).value = "99";
    input(element).dispatchEvent(new Event("input"));
    input(element).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(element.value).toBe(7.5);
  });

  it("refuses values outside min…max when strict and says so; arrows step within", () => {
    const element = make({ value: "0.5", min: "0", max: "1", step: "0.1", strict: "" });
    element.addEventListener("change", () => events.push("change"));
    input(element).value = "3";
    input(element).dispatchEvent(new Event("input"));
    expect(element.shadowRoot!.querySelector(".problem")!.textContent).toBe("0 … 1");
    expect(element.value).toBe(0.5);
    input(element).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(element.value).toBeCloseTo(0.6, 6);
    input(element).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true }));
    expect(element.value).toBe(1); // clamped
    expect(events).toEqual(["change", "change"]);
  });

  it("the reset arrow shows only away from the default and sets it back", () => {
    const element = make({ value: "0", step: "0.05", default: "0" });
    element.addEventListener("change", () => events.push("change"));
    const reset = element.shadowRoot!.querySelector<HTMLButtonElement>(".reset")!;
    expect(reset.hidden).toBe(true);
    element.setAttribute("value", "0.4");
    expect(reset.hidden).toBe(false);
    reset.click();
    expect(element.value).toBe(0);
    expect(reset.hidden).toBe(true);
    expect(events).toEqual(["change"]);
  });
});
