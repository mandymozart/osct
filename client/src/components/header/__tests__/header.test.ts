import { beforeEach, describe, expect, it } from "vitest";
import { GameStoreService } from "@/services";
import { GameMode } from "@/types";
import { ONBOARDING_ICON_SRC } from "@/utils/static-splash-html";
import "..";

const game = GameStoreService.getInstance();

beforeEach(() => {
  document.body.innerHTML = "";
  game.history.reset();
});

describe("header", () => {
  it("shows the crocodile eye in scan and consultation (#297), the counter only on the entries list", () => {
    const header = document.body.appendChild(document.createElement("game-header"));
    const mark = header.shadowRoot!.querySelector("mark-the-page")!;
    const icon = () => mark.shadowRoot!.querySelector<HTMLImageElement>("img.mark");

    game.router.navigate("/spread");
    expect(game.state.mode).toBe(GameMode.SCAN);
    expect(icon()?.getAttribute("src")).toBe(ONBOARDING_ICON_SRC);

    game.router.navigate("/entries");
    expect(game.state.mode).toBe(GameMode.CONSULTATION);
    expect(header.getAttribute("page")).toBe("entries");
    expect(icon()?.getAttribute("src")).toBe(ONBOARDING_ICON_SRC);
    // The slanted target picture beside the icon is gone (#297)
    expect(mark.shadowRoot!.querySelectorAll("img")).toHaveLength(1);
    expect(header.shadowRoot!.querySelector(".counter-label")?.textContent).toBe("Marginalia consulted");
  });
});
