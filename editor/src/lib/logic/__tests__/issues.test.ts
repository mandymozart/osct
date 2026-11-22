import { describe, expect, it } from "vitest";
import { issueRows, issueSummary } from "../issues";
import { project } from "../project";
import type { Problem } from "../types";
import { content } from "./fixture";

describe("the issues bar (#334)", () => {
  const problems: Problem[] = [
    { message: "keyRattled is emitted, but nothing in the experience listens to it", severity: "warning", node: "event:keyRattled", place: "keyRattled", short: "emitted, nothing listens to it" },
    { message: "Door rule 1: goto scene:gone – the experience has no scene gone", severity: "error", node: "rule:1", place: "Door rule 1", short: "goto: no scene gone" },
    { message: "tries is read, but nothing in the experience sets it", severity: "warning", node: "var:tries", place: "tries" },
    { message: "Scene door, rule 2, when: not a true / false.", severity: "error" },
  ];

  it("lists errors first, each kind in its order, with the box's name and the short words", () => {
    expect(issueRows(problems).map(r => [r.severity, r.place, r.text, r.node])).toEqual([
      ["error", "Door rule 1", "goto: no scene gone", "rule:1"],
      ["error", "", "Scene door, rule 2, when: not a true / false", null],
      ["warning", "keyRattled", "emitted, nothing listens to it", "event:keyRattled"],
      // no short words: the message without the name it starts with
      ["warning", "tries", "is read, but nothing in the experience sets it", "var:tries"],
    ]);
    expect(issueRows(problems)[0].message).toBe(problems[1].message);
  });

  it("counts in the deck's words", () => {
    const rows = issueRows(problems);
    expect(issueSummary(rows)).toBe("2 errors · 2 warnings");
    expect(issueSummary(rows.filter(r => r.severity === "warning").slice(0, 1))).toBe("1 warning");
    expect(issueSummary(rows.filter(r => r.severity === "error"))).toBe("2 errors");
    expect(issueSummary([])).toBe("no issues");
  });

  it("a scene's problem at a wider level goes to its box in the scene's level", () => {
    const [row] = issueRows(project(content, { level: "group", group: "ch1" }).problems);
    expect(row).toMatchObject({ severity: "warning", place: "doorOpened", text: "emitted, nothing listens to it", node: "event:doorOpened", context: { level: "scene", scene: "door" } });
    // at the scene's own level the box is there: no level to go to
    const [own] = issueRows(project(content, { level: "scene", scene: "door" }).problems);
    expect(own).toMatchObject({ node: "event:doorOpened", context: null });
  });
});
