import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameStoreService, UpdateService } from "@/services";
import { type ArStatus, Pages } from "@/types";
import { noticeMessage } from "../new-version";

/** The book's skipped features (RULES #10, #220) – set per test */
const skipped = vi.hoisted(() => ({ list: [] as Array<{ path: string; kind: string; name: string }> }));
vi.mock("@/utils/game-config", async importOriginal => ({
  ...(await importOriginal<typeof import("@/utils/game-config")>()),
  getSkippedFeatures: () => skipped.list,
}));

const { NEWER_CONTENT_SEEN_KEY } = await import("../new-version-notice");

describe("the notice's message", () => {
  const state = (newerContent: boolean, outdated: boolean, page: Pages = Pages.ENTRIES, arStatus: ArStatus = "paused") =>
    noticeMessage({ newerContent, outdated, dismissed: false, page, arStatus });

  it("the hint about newer features first, the new version otherwise, both only at a calm moment", () => {
    expect(state(true, false)).toBe("newer-content");
    expect(state(true, true)).toBe("newer-content");
    expect(state(false, true)).toBe("update");
    expect(state(false, false)).toBeNull();
    expect(state(true, true, Pages.SPREAD, "running")).toBeNull();
    expect(state(true, false, Pages.TUTORIAL, "idle")).toBeNull();
  });
});

describe("<new-version-notice> with a book of newer features", () => {
  const game = GameStoreService.getInstance();
  const updates = UpdateService.getInstance();
  let notice: HTMLElement;
  const box = () => notice.shadowRoot!.querySelector<HTMLElement>(".notice")!;
  const shown = () => notice.hasAttribute("shown") && !box().hidden;
  const button = (action: string) => notice.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  const open = () => {
    notice = document.createElement("new-version-notice");
    document.body.appendChild(notice);
  };

  beforeEach(() => {
    localStorage.removeItem(NEWER_CONTENT_SEEN_KEY);
    skipped.list = [{ path: "entities.fx.components[1]", kind: "component", name: "sparkle" }];
    game.router.navigate("/entries");
    game.setArStatus("paused");
  });

  afterEach(() => notice?.remove());

  it("says that an update shows everything – without Reload while no new version is ready", () => {
    expect(updates.isOutdated).toBe(false);
    open();
    expect(shown()).toBe(true);
    expect(box().textContent).toContain("This book uses features this app version doesn't know yet – update the app to see everything.");
    expect(button("reload").hidden).toBe(true);
    expect(button("later").getAttribute("aria-label")).toBe("Close");
  });

  it("never during AR, back at a calm moment", () => {
    open();
    game.router.navigate("/spread");
    game.setArStatus("running");
    expect(shown()).toBe(false);
    game.router.navigate("/about");
    game.setArStatus("paused");
    expect(shown()).toBe(true);
  });

  it("once per book version: closed, it stays closed; on the next start it does not show again", () => {
    open();
    expect(shown()).toBe(true);
    button("later").click();
    expect(shown()).toBe(false);
    notice.remove();
    open();
    expect(shown()).toBe(false);
    // Another book version shows it again
    localStorage.setItem(NEWER_CONTENT_SEEN_KEY, "an older build");
    notice.remove();
    open();
    expect(shown()).toBe(true);
  });

  it("nothing skipped – no hint", () => {
    skipped.list = [];
    open();
    expect(shown()).toBe(false);
  });

  it("offers Reload when a new version is ready too; closed, the new version's notice remains", () => {
    open();
    updates.reportStaleCode();
    expect(shown()).toBe(true);
    expect(box().textContent).toContain("doesn't know yet");
    expect(button("reload").hidden).toBe(false);
    button("later").click();
    expect(shown()).toBe(true);
    expect(box().textContent).toContain("A new version of the app is ready.");
    expect(button("later").getAttribute("aria-label")).toBe("Later");
  });
});
