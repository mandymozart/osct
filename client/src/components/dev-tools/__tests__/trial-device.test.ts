import { describe, expect, it } from "vitest";
import {
  devicePrefill, iphoneCandidates, IPHONE_SCREENS, modelName, osLine, pickList, PHONE_MODELS, readUaHints, samsungName, screenLine,
} from "../trial-device";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1";
const OLD_IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

/** A navigator with Chromium's client hints, answering with these values */
const withHints = (values: Record<string, string>, platform = "Android") =>
  ({ userAgentData: { platform, getHighEntropyValues: async () => ({ platform, ...values }) } }) as unknown as Navigator;

describe("trial device: prefill", () => {
  it("reads the model code and the real Android version from Chromium's client hints", async () => {
    expect(await readUaHints(withHints({ model: "SM-S901B", platformVersion: "14.0.0" }))).toEqual({
      model: "SM-S901B", platform: "Android", platformVersion: "14.0.0",
    });
  });

  it("has no hints where the browser has none, refuses them or has no model (a desktop)", async () => {
    expect(await readUaHints({} as Navigator)).toEqual({});
    const refusing = { userAgentData: { getHighEntropyValues: () => Promise.reject(new Error("denied")) } } as unknown as Navigator;
    expect(await readUaHints(refusing)).toEqual({});
    expect((await readUaHints(withHints({ model: "", platformVersion: "15.0.0" }, "Windows"))).model).toBeUndefined();
  });

  it("names well-known Samsung codes and keeps the code; unknown codes stay as they are", () => {
    expect(samsungName("SM-S901B")).toBe("Galaxy S22");
    expect(samsungName("SM-S901U1")).toBe("Galaxy S22");
    expect(samsungName("SM-S938B")).toBe("Galaxy S25 Ultra");
    expect(samsungName("SM-G991B")).toBe("Galaxy S21");
    expect(samsungName("SM-A546B")).toBeNull();
    expect(modelName("SM-S901B")).toBe("Galaxy S22 (SM-S901B)");
    expect(modelName("SM-A546B")).toBe("SM-A546B");
    expect(modelName("Pixel 8")).toBe("Pixel 8");
  });

  it("prefills the model from the browser on Android", () => {
    const prefill = devicePrefill(ANDROID_UA, { width: 360, height: 780, ratio: 3 }, { model: "SM-S901B", platform: "Android", platformVersion: "14.0.0" });
    expect(prefill).toMatchObject({ model: "Galaxy S22 (SM-S901B)", candidates: [], source: "from the browser: SM-S901B" });
  });

  it("narrows an iPhone by its screen and pixel ratio – a guess, the field stays empty", () => {
    const prefill = devicePrefill(IPHONE_UA, { width: 375, height: 812, ratio: 3 }, {});
    expect(prefill.model).toBe("");
    expect(prefill.candidates).toEqual(["iPhone 12 mini", "iPhone 13 mini", "iPhone X", "iPhone XS", "iPhone 11 Pro"]);
    expect(prefill.source).toBe("screen-size guess: iPhone 12 mini / 13 mini / X / XS / 11 Pro");
    expect(prefill.hint).toContain("a guess from the screen size (375×812 @3)");
    expect(prefill.hint).toContain("pick or type yours");
  });

  it("tells the iPhone screens apart after Apple's point sizes", () => {
    const at = (width: number, height: number, ratio: number) => iphoneCandidates(IPHONE_UA, { width, height, ratio });
    expect(at(390, 844, 3)).toEqual(expect.arrayContaining(["iPhone 12", "iPhone 13", "iPhone 14", "iPhone 16e"]));
    expect(at(393, 852, 3)).toEqual(expect.arrayContaining(["iPhone 14 Pro", "iPhone 15", "iPhone 16"]));
    expect(at(402, 874, 3)).toEqual(["iPhone 16 Pro", "iPhone 17", "iPhone 17 Pro"]);
    expect(at(440, 956, 3)).toEqual(["iPhone 16 Pro Max", "iPhone 17 Pro Max"]);
    expect(at(420, 912, 3)).toEqual(["iPhone Air"]);
    expect(at(414, 896, 2)).toContain("iPhone 11");
    expect(at(414, 896, 3)).toContain("iPhone 11 Pro Max");
    expect(at(320, 693, 3)).toEqual([]); // Display Zoom: no guess
    // Not an iPhone: no guess from the screen
    expect(iphoneCandidates(ANDROID_UA, { width: 375, height: 812, ratio: 3 })).toEqual([]);
    // Every model of the 11–17 pick list has its screen in the table
    const screened = new Set(Object.values(IPHONE_SCREENS).flat());
    expect(PHONE_MODELS.iPhone.filter(model => !screened.has(model))).toEqual([]);
  });

  it("has no prefill without client hints on another phone", () => {
    expect(devicePrefill(ANDROID_UA, { width: 360, height: 780, ratio: 3 }, {})).toEqual({ model: "", candidates: [], source: "no prefill", hint: "" });
  });

  it("offers the guess first in the pick list, then every listed phone", () => {
    expect(pickList([]).map(g => g.group)).toEqual(["iPhone", "Galaxy", "Pixel"]);
    const guessed = pickList(["iPhone 12 mini", "iPhone 13 mini"]);
    expect(guessed[0]).toEqual({ group: "Screen-size guess", models: ["iPhone 12 mini", "iPhone 13 mini"] });
    expect(guessed.slice(1).map(g => g.group)).toEqual(["iPhone", "Galaxy", "Pixel"]);
    expect(PHONE_MODELS.Galaxy).toEqual(expect.arrayContaining(["Galaxy S21", "Galaxy S25 Ultra"]));
    expect(PHONE_MODELS.Pixel).toEqual(expect.arrayContaining(["Pixel 6", "Pixel 9 Pro XL"]));
  });

  it("writes the screen as width × height @ ratio", () => {
    expect(screenLine({ width: 375, height: 812, ratio: 3 })).toBe("375×812 @3");
    expect(screenLine({ width: 384, height: 832, ratio: 2.81 })).toBe("384×832 @2.81");
  });
});

describe("trial device: OS line", () => {
  it("takes the real version from the client hints", () => {
    expect(osLine(ANDROID_UA, { platform: "Android", platformVersion: "14.0.0" })).toBe("Android 14.0.0 (from the browser)");
  });

  it("says that Safari 26 freezes the iOS version", () => {
    expect(osLine(IPHONE_UA, {})).toBe("iOS 18.7 as Safari reports it – frozen: Safari 26 comes with iOS 26");
    expect(osLine(OLD_IPHONE_UA, {})).toBe("iOS 17.5 as the browser reports it");
  });

  it("says that Chrome reduces the Android version", () => {
    expect(osLine(ANDROID_UA, {})).toBe("Android 10 as the browser reports it – reduced, the real version is not known");
    expect(osLine("Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0", {})).toBe("Android 14 as the browser reports it");
    expect(osLine("Mozilla/5.0 (X11; Linux x86_64)", {})).toBe("not reported – see the user agent");
  });
});
