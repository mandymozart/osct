import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ".."; // registers the elements
import i18next from "i18next";
import { FeedbackService, GameStoreService } from "@/services";
import { LANGUAGE_STORAGE_KEY } from "@/i18n";
import { Pages } from "@/types";
import { getEntries } from "@/utils/game-config";

const game = GameStoreService.getInstance();
const mount = (tag: string) => document.body.appendChild(document.createElement(tag));
const click = (host: HTMLElement, selector: string) => host.shadowRoot!.querySelector<HTMLElement>(selector)!.click();

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  game.history.reset();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await i18next.changeLanguage("en");
});

describe("settings sections", () => {
  it("tutorial: starts the onboarding", () => {
    const section = mount("settings-tutorial");
    click(section, "[data-action=tutorial]");
    expect(game.state.currentRoute).toMatchObject({ page: Pages.TUTORIAL, param: { value: "0" } });
  });

  it("sound & vibration: toggles each setting and keeps it on this device", () => {
    const feedback = FeedbackService.getInstance();
    feedback.setSettings({ sound: true, haptics: true });
    const section = mount("settings-feedback");
    expect(section.shadowRoot!.textContent).toContain("Sounds: on");

    click(section, "[data-setting=haptics]");
    expect(feedback.getSettings()).toEqual({ sound: true, haptics: false });
    expect(section.shadowRoot!.querySelector("[data-setting=haptics]")!.getAttribute("aria-pressed")).toBe("false");
    expect(section.shadowRoot!.textContent).toContain("Vibration: off");
    click(section, "[data-setting=haptics]");
    expect(feedback.getSettings().haptics).toBe(true);
  });

  it("history: resets the book after a confirmation and keeps the language", () => {
    const entry = getEntries()[0].id;
    game.history.consultEntry(entry);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "nl");
    const section = mount("settings-history");

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    click(section, "[data-action=reset]");
    expect(game.history.isConsulted(entry)).toBe(true);

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    click(section, "[data-action=reset]");
    expect(game.history.isConsulted(entry)).toBe(false);
    expect(section.shadowRoot!.textContent).toContain("All saved progress on this device was deleted.");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("nl");
  });

  it("language: lists the languages and stores the choice (the app reloads)", async () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
    const section = mount("settings-language");
    expect(section.shadowRoot!.textContent).toContain("English");

    click(section, "[data-action=toggle]");
    const options = Array.from(section.shadowRoot!.querySelectorAll<HTMLElement>("[data-language]"), b => b.textContent?.trim());
    expect(options).toEqual(["English", "Français", "Nederlands", "Deutsch"]);

    click(section, "[data-language=de]");
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("de");
  });
});
