import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ".."; // registers the elements
import i18next from "i18next";
import { FeedbackService, GameStoreService, InstallService, PreloaderService, UserService } from "@/services";
import { UserSnapshot } from "@/types";
import { LANGUAGE_STORAGE_KEY } from "@/i18n";
import { Pages } from "@/types";
import { getEntries } from "@/utils/game-config";

const game = GameStoreService.getInstance();
const mount = (tag: string) => document.body.appendChild(document.createElement(tag));
const click = (host: HTMLElement, selector: string) => host.shadowRoot!.querySelector<HTMLElement>(selector)!.click();
/** The checkbox inside a `<gold-switch>` */
const switchInput = (host: HTMLElement, option: string) =>
  host.shadowRoot!.querySelector(`gold-switch[data-option=${option}]`)!.shadowRoot!.querySelector("input")!;

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
  describe("account", () => {
    const users = UserService.getInstance();
    const snapshot = (changes: Partial<UserSnapshot>): UserSnapshot => ({
      status: "signed-out", user: null, pending: null, sync: "off", busy: false, notice: null, ...changes,
    });

    it("signed out: email, then the update options underneath – off until turned on (opt-in)", () => {
      const request = vi.spyOn(users, "requestLogin").mockResolvedValue(true);
      const section = mount("settings-account");
      expect(section.shadowRoot!.textContent).toContain("Register your copy");
      expect(section.shadowRoot!.querySelector("form + .switches")).not.toBeNull();
      expect(switchInput(section, "bookUpdates").checked || switchInput(section, "publisherUpdates").checked).toBe(false);
      switchInput(section, "bookUpdates").click();
      const input = section.shadowRoot!.querySelector<HTMLInputElement>("input[name=email]")!;
      input.value = "reader@example.com";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      section.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      expect(request).toHaveBeenCalledWith("reader@example.com", { bookUpdates: true, artistUpdates: false, publisherUpdates: false });
    });

    it("pending: asks for the code from the email", () => {
      vi.spyOn(users, "getSnapshot").mockReturnValue(snapshot({ status: "pending", pending: { requestId: "r", email: "reader@example.com", expiresAt: "" } }));
      const confirm = vi.spyOn(users, "confirmCode").mockResolvedValue(true);
      const section = mount("settings-account");
      expect(section.shadowRoot!.textContent).toContain("reader@example.com");
      const input = section.shadowRoot!.querySelector<HTMLInputElement>("input[name=code]")!;
      input.value = "123456";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      section.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      expect(confirm).toHaveBeenCalledWith("123456");
    });

    it("signed in: the address, the options as switches, sign out, delete after a confirmation", () => {
      vi.spyOn(users, "getSnapshot").mockReturnValue(snapshot({
        status: "signed-in", sync: "synced",
        user: { email: "reader@example.com", language: "en", createdAt: "", options: { bookUpdates: false, artistUpdates: false, publisherUpdates: true } },
      }));
      const setOption = vi.spyOn(users, "setOption").mockResolvedValue();
      const remove = vi.spyOn(users, "deleteUser").mockResolvedValue(true);
      const section = mount("settings-account");
      expect(section.shadowRoot!.textContent).toContain("Your progress is saved in your account.");
      switchInput(section, "bookUpdates").click();
      expect(setOption).toHaveBeenCalledWith("bookUpdates", true);
      vi.spyOn(window, "confirm").mockReturnValueOnce(false);
      click(section, "[data-action=delete]");
      expect(remove).not.toHaveBeenCalled();
    });

    it("shows the API's error in the reader's words", () => {
      vi.spyOn(users, "getSnapshot").mockReturnValue(snapshot({ notice: { error: "too-many-requests" } }));
      expect(mount("settings-account").shadowRoot!.textContent).toContain("Try again in an hour.");
    });
  });

  it("install: the button stays until the app is installed – the dialog where there is one, else the steps", async () => {
    const install = InstallService.getInstance();
    vi.spyOn(install, "getMethod").mockReturnValue("manual");
    const section = mount("settings-install");
    expect(section.shadowRoot!.textContent).toContain("Install as app on this device");
    click(section, "[data-action=install]");
    expect(section.shadowRoot!.textContent).toContain("Add to Home Screen");

    vi.mocked(install.getMethod).mockReturnValue("installed");
    section.remove();
    const installed = mount("settings-install");
    expect(installed.shadowRoot!.querySelector("[data-action=install]")).toBeNull();
    expect(installed.shadowRoot!.textContent).toContain("from your home screen");

    vi.mocked(install.getMethod).mockReturnValue("prompt");
    const prompt = vi.spyOn(install, "prompt").mockResolvedValue(true);
    installed.remove();
    const withPrompt = mount("settings-install");
    click(withPrompt, "[data-action=install]");
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("all content: shows the size, downloads with a progress bar, then says it is on the device", async () => {
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
    expect(section.shadowRoot!.textContent).toContain("All content is on this device (20 MB)");
  });

  it("sound & vibration: a switch each, kept on this device", () => {
    const feedback = FeedbackService.getInstance();
    feedback.setSettings({ sound: true, haptics: true });
    const section = mount("settings-feedback");
    const haptics = section.shadowRoot!.querySelector("gold-switch[data-setting=haptics]")!;
    expect(haptics.shadowRoot!.querySelector("input")!.checked).toBe(true);

    haptics.shadowRoot!.querySelector("input")!.click();
    expect(feedback.getSettings()).toEqual({ sound: true, haptics: false });
    haptics.shadowRoot!.querySelector("input")!.click();
    expect(feedback.getSettings().haptics).toBe(true);
  });

  it("history (reset): says it reaches the account when signed in", () => {
    vi.spyOn(UserService.getInstance(), "getSnapshot").mockReturnValue({
      status: "signed-in", pending: null, sync: "synced", busy: false, notice: null,
      user: { email: "a@b.c", language: "en", createdAt: "", options: { bookUpdates: true, artistUpdates: false, publisherUpdates: true } },
    });
    expect(mount("settings-history").shadowRoot!.textContent).toContain("on this device and in your account");
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
