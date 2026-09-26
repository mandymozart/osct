import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ".."; // registers the elements
import i18next from "i18next";
import { FeedbackService, GameStoreService, InstallService, UserService } from "@/services";
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
