import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameStoreService } from "@/services";
import { BaseStore } from "@/store/BaseStore";
import { ErrorCode, GameState } from "@/types";
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
});
