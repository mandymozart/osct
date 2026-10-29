import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameStoreService } from "@/services";
import { BaseStore } from "@/store/BaseStore";
import { ErrorCode, GameState, LoadingState } from "@/types";
import "../error-page";

const game = GameStoreService.getInstance();
const errorListeners = () => (game as unknown as BaseStore<GameState>).propertyListeners.get("currentError")?.length ?? 0;

describe("error page", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    game.router.navigate("/");
    game.router.dismissError();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  const mount = () => document.body.appendChild(document.createElement("error-page"));

  it("leaves no listener on the store once disconnected", () => {
    const before = errorListeners();
    const page = mount();
    expect(errorListeners()).toBe(before + 1);
    page.remove();
    expect(errorListeners()).toBe(before);

    // Reconnecting subscribes once, not once more per connect
    document.body.appendChild(page);
    expect(errorListeners()).toBe(before + 1);
    page.remove();
    expect(errorListeners()).toBe(before);
  });

  it("shows an error with its action and hides when it is dismissed", () => {
    const page = mount();
    expect(page.getAttribute("active")).not.toBe("true");

    const callback = vi.fn();
    game.router.showError({ code: ErrorCode.NOT_FOUND, msg: "Nothing here", action: { text: "Retry", callback } });
    expect(page.getAttribute("active")).toBe("true");
    expect(page.shadowRoot!.querySelector(".message")!.textContent).toContain("Nothing here");
    expect(page.shadowRoot!.querySelector("#action-button")).not.toBeNull();

    game.router.dismissError();
    expect(page.getAttribute("active")).toBe("false");
  });

  it("ignores store changes after it was disconnected", () => {
    const page = mount();
    page.remove();
    game.router.showError({ code: ErrorCode.NOT_FOUND, msg: "Unseen" });
    expect(page.getAttribute("active")).not.toBe("true");
  });

  /** The buttons get their listeners after the render (next task) */
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  it("the action button runs the error's callback", async () => {
    const page = mount();
    const callback = vi.fn();
    game.router.showError({ code: ErrorCode.NOT_FOUND, msg: "Nothing here", action: { text: "Retry", callback } });
    await settle();
    page.shadowRoot!.querySelector<HTMLElement>("#action-button")!.click();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("dismiss clears the error and returns to the view underneath", async () => {
    const page = mount();
    game.router.navigate("/about");
    game.router.showError({ code: ErrorCode.NOT_FOUND, msg: "Nothing here" });
    expect(page.shadowRoot!.querySelector("#action-button")).toBeNull();
    await settle();
    page.shadowRoot!.querySelector<HTMLElement>("#dismiss-error")!.click();
    expect(game.state.currentError).toBeNull();
    expect(game.state.currentRoute?.page).toBe("about");
    expect(page.getAttribute("active")).toBe("false");
  });

  it("shows a message given directly and ends the loading state", () => {
    const page = mount() as HTMLElement & { showError(msg: string, options?: { code?: string }): void };
    game.startLoading();
    page.showError("Direct message", { code: "x" });
    expect(page.getAttribute("active")).toBe("true");
    expect(page.shadowRoot!.querySelector(".message")!.textContent).toContain("Direct message");
    expect(game.state.loading).toBe(LoadingState.LOADED);
  });
});
