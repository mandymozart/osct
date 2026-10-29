import { beforeEach, describe, expect, it } from "vitest";
import { CONTENT_OVERRIDE_KEY, contentBaseOverride } from "../game-config";

/** `?content=<base url>` opens another book in a debug build's reader (the demo on staging) */
describe("contentBaseOverride", () => {
  beforeEach(() => sessionStorage.clear());

  it("takes the base URL from the address and keeps it for the tab", () => {
    expect(contentBaseOverride("?content=https://cdn.example/demo/", true)).toBe("https://cdn.example/demo");
    expect(sessionStorage.getItem(CONTENT_OVERRIDE_KEY)).toBe("https://cdn.example/demo");
    expect(contentBaseOverride("", true)).toBe("https://cdn.example/demo");
    expect(contentBaseOverride("?osct=1.2.3", true)).toBe("https://cdn.example/demo");
  });

  it("an empty or invalid value forgets it", () => {
    sessionStorage.setItem(CONTENT_OVERRIDE_KEY, "https://cdn.example/demo");
    expect(contentBaseOverride("?content=", true)).toBeNull();
    expect(contentBaseOverride("?content=javascript:alert(1)", true)).toBeNull();
  });

  it("a production build ignores the parameter", () => {
    expect(contentBaseOverride("?content=https://cdn.example/demo", false)).toBeNull();
    expect(sessionStorage.getItem(CONTENT_OVERRIDE_KEY)).toBeNull();
  });
});
