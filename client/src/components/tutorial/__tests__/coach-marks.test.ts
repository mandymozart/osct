import { afterEach, describe, expect, it } from "vitest";
import { COACH_MARKS, holeRect } from "../coach-marks";
import { GameStoreService } from "@/services";

const screen = { width: 390, height: 844 };

describe("coach marks' hole (#282)", () => {
  it("grows the scroller's box by the padding on every side", () => {
    expect(holeRect({ left: 0, top: 760, width: 390, height: 60 }, "pill", 8, screen))
      .toEqual({ left: -8, top: 752, width: 406, height: 76 });
  });

  it("puts a circle around the icon's centre that holds its longer side", () => {
    expect(holeRect({ left: 145, top: 10, width: 100, height: 80 }, "circle", 8, screen))
      .toEqual({ left: 137, top: -8, width: 116, height: 116 });
  });

  it("puts an ellipse round the wide eye: its box grown by the padding (#297)", () => {
    expect(holeRect({ left: 96, top: 8, width: 197, height: 84 }, "ellipse", 8, screen))
      .toEqual({ left: 88, top: 0, width: 213, height: 100 });
    expect(COACH_MARKS.find(mark => mark.id === "icon")?.shape).toBe("ellipse");
  });

  it("leaves no hole for a missing or hidden element, so the veil covers everything", () => {
    expect(holeRect(null, "pill", 8, screen)).toEqual({ left: 195, top: 422, width: 0, height: 0 });
    expect(holeRect({ left: 10, top: 10, width: 0, height: 0 }, "circle", 8, screen).width).toBe(0);
  });

  it("reveals the page scroller first, then the icon", () => {
    expect(COACH_MARKS.map(mark => mark.target.at(-1))).toEqual(["spread-menu", "mark-the-page"]);
  });
});

describe("coach marks over the scan view (#282)", () => {
  const game = GameStoreService.getInstance();
  let element: HTMLElement | null = null;

  afterEach(() => {
    element?.remove();
    element = null;
  });

  const mount = () => {
    element = document.createElement("coach-marks");
    document.body.appendChild(element);
    return element;
  };

  it("stays hidden outside scan mode", () => {
    game.history.setCoached(false);
    game.router.navigate("/about");
    expect(mount().hidden).toBe(true);
  });

  it("walks through both steps in scan mode and remembers that they were seen", () => {
    game.history.setCoached(false);
    game.router.navigate("/spread");
    const marks = mount();
    expect(marks.hidden).toBe(false);
    expect(marks.getAttribute("step")).toBe("scroller");
    marks.shadowRoot!.querySelector<HTMLButtonElement>(".actions button")!.click();
    expect(marks.getAttribute("step")).toBe("icon");
    marks.shadowRoot!.querySelector<HTMLButtonElement>(".actions button")!.click();
    expect(game.state.progress.coached).toBe(true);
    expect(marks.hidden).toBe(true);
  });
});
