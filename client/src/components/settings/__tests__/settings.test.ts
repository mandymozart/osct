import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ".."; // registers the elements
import { GameStoreService, SETTINGS_KEY, SettingsService } from "@/services";
import { Pages } from "@/types";
import { getEntries } from "@/utils/game-config";

const game = GameStoreService.getInstance();
const mount = (tag: string) => document.body.appendChild(document.createElement(tag));
const click = (host: HTMLElement, selector: string) => host.shadowRoot!.querySelector<HTMLElement>(selector)!.click();

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.removeItem(SETTINGS_KEY);
  game.history.reset();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("settings sections", () => {
  it("tutorial: starts the onboarding", () => {
    const section = mount("settings-tutorial");
    click(section, "[data-action=tutorial]");
    expect(game.state.currentRoute).toMatchObject({ page: Pages.TUTORIAL, param: { value: "0" } });
  });

  it("history: resets the book after a confirmation and keeps the language", () => {
    const entry = getEntries()[0].id;
    game.history.consultEntry(entry);
    SettingsService.getInstance().setLanguage("nl");
    const section = mount("settings-history");

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    click(section, "[data-action=reset]");
    expect(game.history.isConsulted(entry)).toBe(true);

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    click(section, "[data-action=reset]");
    expect(game.history.isConsulted(entry)).toBe(false);
    expect(section.shadowRoot!.textContent).toContain("All saved progress on this device was deleted.");
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toEqual({ language: "nl" });
  });

  it("language: lists the languages and stores the choice (the app reloads)", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
    const section = mount("settings-language");
    expect(section.shadowRoot!.textContent).toContain("English");

    click(section, "[data-action=toggle]");
    const options = Array.from(section.shadowRoot!.querySelectorAll<HTMLElement>("[data-language]"), b => b.textContent?.trim());
    expect(options).toEqual(["English", "Français", "Nederlands", "Deutsch"]);

    click(section, "[data-language=de]");
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toEqual({ language: "de" });
    expect(reload).toHaveBeenCalled();
  });
});

describe("settings storage", () => {
  it("follows the device without a choice and ignores invalid values", () => {
    expect(SettingsService.getInstance().language).toBe("en");
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ language: "xx" }));
    expect(SettingsService.getInstance().language).toBe("en");
    localStorage.setItem(SETTINGS_KEY, "{broken");
    expect(SettingsService.getInstance().language).toBe("en");
  });
});
