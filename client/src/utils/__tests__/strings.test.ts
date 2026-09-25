import { describe, expect, it } from "vitest";
import { escapeHtml, paragraphs } from "../strings";

describe("strings", () => {
  it("splits a text into paragraphs at blank lines", () => {
    expect(paragraphs("One\nstill one\n\n  Two  \n\n\n")).toEqual(["One\nstill one", "Two"]);
  });

  it("escapes text for HTML content and attributes", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;");
  });
});
