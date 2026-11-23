import { describe, expect, it } from "vitest";
import { isDesktopVisitor, landingMode, landingQrUrl, privacyHref, readDeviceSignals } from "..";

const desktop = { standalone: false, coarsePointer: false, mobileAgent: false, wide: true };

describe("isDesktopVisitor and landingMode", () => {
  it("is true for a computer: fine pointer, desktop browser, wide window", () => {
    expect(isDesktopVisitor(desktop)).toBe(true);
  });

  it("is false for phones and tablets, the installed app and narrow windows", () => {
    expect(isDesktopVisitor({ ...desktop, coarsePointer: true })).toBe(false);
    expect(isDesktopVisitor({ ...desktop, mobileAgent: true })).toBe(false);
    expect(isDesktopVisitor({ ...desktop, standalone: true })).toBe(false);
    expect(isDesktopVisitor({ ...desktop, wide: false })).toBe(false);
  });

  it("gives a computer the landing on every experience's path – the static page on the default's, placeholders elsewhere (#355)", () => {
    expect(landingMode(desktop, false, "osct", "osct")).toBe("page");
    expect(landingMode(desktop, false, null, null)).toBe("page");
    expect(landingMode(desktop, false, "demo", "osct")).toBe("skeleton");
    expect(landingMode(desktop, true, "demo", "osct")).toBeNull();
    expect(landingMode({ ...desktop, coarsePointer: true }, false, "osct", "osct")).toBeNull();
  });
});

describe("readDeviceSignals", () => {
  const fakeWindow = (queries: string[], navigator: Partial<Navigator>) => ({
    matchMedia: (query: string) => ({ matches: queries.includes(query) }),
    navigator: { platform: "Win32", maxTouchPoints: 0, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130", ...navigator },
  }) as unknown as Window;

  it("reads a desktop browser", () => {
    expect(readDeviceSignals(fakeWindow(["(min-width: 56.25em)"], {}))).toEqual(desktop);
  });

  it("knows an iPad posing as a Mac and an Android phone", () => {
    expect(readDeviceSignals(fakeWindow([], { platform: "MacIntel", maxTouchPoints: 5 })).mobileAgent).toBe(true);
    expect(readDeviceSignals(fakeWindow(["(pointer: coarse)"], { userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile" })))
      .toMatchObject({ coarsePointer: true, mobileAgent: true });
  });
});

describe("the landing's links", () => {
  it("opens the app on a phone with the landing as its source (?s=lp1, #324), below the experience's path", () => {
    expect(landingQrUrl("https://osct.buildingfictions.com", "")).toBe("https://osct.buildingfictions.com/?s=lp1");
    expect(landingQrUrl("https://osct.buildingfictions.com", "/osct")).toBe("https://osct.buildingfictions.com/osct/?s=lp1");
  });

  it("links the static Privacy & terms page below the experience's path (#355)", () => {
    expect(privacyHref("/osct")).toBe("/osct/privacy");
    expect(privacyHref("")).toBe("/privacy");
  });
});
