import { beforeEach, describe, expect, it } from "vitest";
import { GameStoreService } from "@/services";
import { GameMode } from "@/types";
import { getEntries, getSpreads } from "@/utils/game-config";
import { currentTargetImage } from "../mark-the-page";
import "..";

const game = GameStoreService.getInstance();
const spread = getSpreads().find(s => s.targets.filter(target => target.imageSrc).length > 1)!;
const [first, second] = spread.targets.filter(target => target.imageSrc);

beforeEach(() => {
  document.body.innerHTML = "";
  game.history.reset();
  game.spreads.switchSpread(spread.id);
});

describe("current target image (#283)", () => {
  it("is the spread's first target before any is found, then the one found last", async () => {
    expect(currentTargetImage(game)).toBe(first.imageSrc);
    game.history.unlockTarget(second.id);
    expect(currentTargetImage(game)).toBe(second.imageSrc);
    await new Promise(resolve => setTimeout(resolve, 2));
    game.history.unlockTarget(first.id);
    expect(currentTargetImage(game)).toBe(first.imageSrc);
  });

  it("is the entry's own target on its page", () => {
    const entry = getEntries().find(e => e.target?.imageSrc && e.target.id !== first.id)!;
    game.router.navigate("/entry", { key: "id", value: entry.id });
    expect(currentTargetImage(game)).toBe(entry.target!.imageSrc);
  });
});

describe("header", () => {
  it("shows the target beside the icon only in consultation, the counter only on the entries list", () => {
    const header = document.body.appendChild(document.createElement("game-header"));
    const mark = header.shadowRoot!.querySelector("mark-the-page")!;

    game.router.navigate("/spread");
    expect(game.state.mode).toBe(GameMode.SCAN);
    expect(mark.shadowRoot!.querySelector("[data-target-image]")).toBeNull();

    game.router.navigate("/entries");
    expect(game.state.mode).toBe(GameMode.CONSULTATION);
    expect(header.getAttribute("page")).toBe("entries");
    expect(mark.shadowRoot!.querySelector("[data-target-image]")).not.toBeNull();
    expect(header.shadowRoot!.querySelector(".counter-label")?.textContent).toBe("Marginalia consulted");
  });
});
