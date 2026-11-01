import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameStoreService, UpdateService } from "@/services";
import "../new-version-notice";

describe("<new-version-notice>", () => {
  const game = GameStoreService.getInstance();
  const updates = UpdateService.getInstance();
  let notice: HTMLElement;
  const box = () => notice.shadowRoot!.querySelector<HTMLElement>(".notice")!;
  const shown = () => notice.hasAttribute("shown") && !box().hidden;
  const click = (action: string) => notice.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();

  beforeEach(() => {
    game.router.navigate("/entries");
    game.setArStatus("paused");
    notice = document.createElement("new-version-notice");
    document.body.appendChild(notice);
  });

  afterEach(() => notice.remove());

  it("stays hidden while the page runs the current code", () => {
    expect(updates.isOutdated).toBe(false);
    expect(shown()).toBe(false);
  });

  it("shows on the entries list once the page is out of date, with the text and Reload", () => {
    updates.reportStaleCode();
    expect(shown()).toBe(true);
    expect(box().getAttribute("role")).toBe("status");
    expect(box().textContent).toContain("A new version of the app is ready.");
    expect(notice.shadowRoot!.querySelector('[data-action="reload"]')!.textContent).toBe("Reload");
    expect(notice.shadowRoot!.querySelector('[data-action="later"]')!.getAttribute("aria-label")).toBe("Later");
  });

  it("hides while the reader scans and comes back when scanning stops", () => {
    game.router.navigate("/spread");
    game.setArStatus("starting");
    expect(shown()).toBe(false);
    game.setArStatus("running");
    expect(shown()).toBe(false);

    game.router.navigate("/entry", { key: "entryId", value: "any" });
    game.setArStatus("paused");
    expect(shown()).toBe(true);
  });

  it("in the scan view once AR failed (the AR chunk did not load): shown above the spread menu", () => {
    game.router.navigate("/spread");
    game.setArStatus("error");
    expect(shown()).toBe(true);
    expect(notice.hasAttribute("scan")).toBe(true);
  });

  it("never during the onboarding", () => {
    game.router.navigate("/tutorial");
    game.setArStatus("idle");
    expect(shown()).toBe(false);
  });

  it("Reload reloads – only on the reader's click", () => {
    const reload = vi.spyOn(updates, "reload").mockImplementation(() => {});
    expect(reload).not.toHaveBeenCalled();
    click("reload");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Later hides it until a code file fails again", () => {
    click("later");
    expect(shown()).toBe(false);
    game.router.navigate("/about");
    expect(shown()).toBe(false);
    updates.reportStaleCode();
    expect(shown()).toBe(true);
  });
});
