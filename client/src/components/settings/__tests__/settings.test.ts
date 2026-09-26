import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ".."; // registers the elements
import i18next from "i18next";
import { FeedbackService, GameStoreService, InstallService, PreloaderService } from "@/services";
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

  it("home screen: offers the browser's install dialog when there is one, else explains how", async () => {
    const install = InstallService.getInstance();
    const section = mount("settings-install");
    expect(section.shadowRoot!.querySelector("[data-action=install]")).toBeNull();
    expect(section.shadowRoot!.textContent).toContain("Add to Home Screen");

    vi.spyOn(install, "getMethod").mockReturnValue("prompt");
    const prompt = vi.spyOn(install, "prompt").mockResolvedValue(true);
    section.remove();
    const withPrompt = mount("settings-install");
    click(withPrompt, "[data-action=install]");
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("whole book: shows the size, downloads with a progress bar, then says it is on the device", async () => {
    const preloader = PreloaderService.getInstance();
    let finish!: () => void;
    const running = { state: "running" as const, loaded: 5_000_000, total: 20_000_000, failed: 0 };
    vi.spyOn(preloader, "getBookDownload").mockResolvedValue({ state: "idle", loaded: 0, total: 20_000_000, failed: 0 });
    const download = vi.spyOn(preloader, "downloadBook").mockImplementation(() => new Promise(resolve => {
      finish = () => resolve({ ...running, state: "done", loaded: 20_000_000 });
    }));
    const section = mount("settings-download");
    await vi.waitFor(() => expect(section.shadowRoot!.textContent).toContain("(20 MB)"));

    click(section, "[data-action=download]");
    expect(download).toHaveBeenCalledTimes(1);
    const emit = (d: typeof running | { state: "done"; loaded: number; total: number; failed: number }) =>
      (preloader as unknown as { bookListeners: Set<(d: unknown) => void> }).bookListeners.forEach(l => l(d));
    emit(running);
    expect(section.shadowRoot!.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("25");
    expect(section.shadowRoot!.textContent).toContain("5 MB of 20 MB downloaded");
    emit({ ...running, state: "done", loaded: 20_000_000 });
    finish();
    expect(section.shadowRoot!.querySelector("[role=progressbar]")).toBeNull();
    expect(section.shadowRoot!.textContent).toContain("The whole book is on this device (20 MB).");
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
