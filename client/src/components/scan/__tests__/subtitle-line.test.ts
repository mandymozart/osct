import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ".."; // registers the elements
import "@/components/settings";
import { SubtitleService, SUBTITLES_STORAGE_KEY } from "@/services";

const subtitles = SubtitleService.getInstance();
const mount = (tag: string) => document.body.appendChild(document.createElement(tag));
const text = (line: HTMLElement) => line.shadowRoot!.querySelector("p")!.textContent;

beforeEach(() => {
  document.body.innerHTML = "";
  subtitles.setSettings({ enabled: true });
  subtitles.show(null);
});
afterEach(() => localStorage.removeItem(SUBTITLES_STORAGE_KEY));

describe("<subtitle-line>", () => {
  it("shows the scene's line while a video speaks, and goes between cues", () => {
    const line = mount("subtitle-line");
    expect(line.hasAttribute("visible")).toBe(false);
    subtitles.show("Hello.");
    expect(line.hasAttribute("visible")).toBe(true);
    expect(text(line)).toBe("Hello.");
    subtitles.show(null);
    expect(line.hasAttribute("visible")).toBe(false);
  });

  it("shows a line that is already spoken when it connects", () => {
    subtitles.show("Mid-sentence");
    const line = mount("subtitle-line");
    expect(line.hasAttribute("visible")).toBe(true);
    expect(text(line)).toBe("Mid-sentence");
  });

  it("stops listening when it is removed", () => {
    const line = mount("subtitle-line");
    line.remove();
    subtitles.show("Nobody reads this");
    expect(line.hasAttribute("visible")).toBe(false);
  });
});

describe("the subtitles setting", () => {
  it("is on until the reader turns it off – the line goes at once and comes back with the switch", () => {
    const line = mount("subtitle-line");
    subtitles.show("Hello.");
    expect(subtitles.getSettings().enabled).toBe(true);
    subtitles.setSettings({ enabled: false });
    expect(line.hasAttribute("visible")).toBe(false);
    expect(JSON.parse(localStorage.getItem(SUBTITLES_STORAGE_KEY)!)).toEqual({ enabled: false });
    subtitles.setSettings({ enabled: true });
    expect(line.hasAttribute("visible")).toBe(true);
  });

  it("the settings' switch turns it off", () => {
    const section = mount("settings-feedback");
    const input = section.shadowRoot!.querySelector("gold-switch[data-setting=subtitles]")!.shadowRoot!.querySelector("input")!;
    expect(input.checked).toBe(true);
    input.click();
    expect(subtitles.getSettings().enabled).toBe(false);
  });
});
