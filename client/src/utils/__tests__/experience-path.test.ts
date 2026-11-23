import { afterEach, describe, expect, it } from "vitest";
import {
  activeExperience, contentBaseUrl, defaultExperience, experiencePrefix, LAST_EXPERIENCE_KEY, lastExperience, legacyRedirect,
  redirectLegacyAddress, rememberExperience, splitExperiencePath,
} from "../experience-path";

// Every experience at its own path (#343): /<experience>/… – the first segment unless it is one of the site's own paths
describe("the experience in the address", () => {
  it("splits /<experience> off the route; a route of the app, a reserved path or a bad id is the route itself", () => {
    expect(splitExperiencePath("/demo/scene/s2")).toEqual({ experience: "demo", path: "/scene/s2" });
    expect(splitExperiencePath("/demo")).toEqual({ experience: "demo", path: "/" });
    expect(splitExperiencePath("/osct/")).toEqual({ experience: "osct", path: "/" });
    expect(splitExperiencePath("/My_Book/about")).toEqual({ experience: "My_Book", path: "/about" });
    expect(splitExperiencePath("/scene/s2")).toEqual({ experience: null, path: "/scene/s2" });
    expect(splitExperiencePath("/entry/a")).toEqual({ experience: null, path: "/entry/a" });
    expect(splitExperiencePath("/about")).toEqual({ experience: null, path: "/about" });
    expect(splitExperiencePath("/x/demo/about")).toEqual({ experience: null, path: "/x/demo/about" });
    expect(splitExperiencePath("/editor/osct")).toEqual({ experience: null, path: "/editor/osct" });
    expect(splitExperiencePath("/")).toEqual({ experience: null, path: "/" });
    expect(splitExperiencePath("/a%20b/about")).toEqual({ experience: null, path: "/a%20b/about" });
    expect(splitExperiencePath("/%E0%A4%A/about").experience).toBeNull();
  });

  it("the default experience: the build's VITE_EXPERIENCE, else none", () => {
    expect(defaultExperience("osct")).toBe("osct");
    expect(defaultExperience(" ")).toBeNull();
    expect(defaultExperience(undefined)).toBeNull();
    expect(activeExperience("/demo/about", "osct")).toBe("demo");
    expect(activeExperience("/scene/s1", "osct")).toBe("osct");
    expect(activeExperience("/", null)).toBeNull();
  });

  it("writes the prefix for every experience, the default too; none without one (bundled content)", () => {
    expect(experiencePrefix("demo")).toBe("/demo");
    expect(experiencePrefix("osct")).toBe("/osct");
    expect(experiencePrefix(null)).toBe("");
  });

  it("loads the experience's store below the environment's CDN URL; none without one (bundled content)", () => {
    expect(contentBaseUrl("https://cdn.example/osct/staging/", "demo")).toBe("https://cdn.example/osct/staging/demo");
    expect(contentBaseUrl("", "demo")).toBe("");
    expect(contentBaseUrl("https://cdn.example/osct/staging", null)).toBe("");
  });
});

describe("addresses without an experience (#343): codes and links made before", () => {
  const options = { fallback: "osct", last: null };

  it("the printed book's ?s=bk1 opens /osct/, the demo's ?s=d1 /demo/ – the source stays for the arrival count", () => {
    expect(legacyRedirect("/", "?s=bk1", "", options)).toBe("/osct/?s=bk1");
    expect(legacyRedirect("/", "?s=BK1", "", { fallback: "demo", last: "demo" })).toBe("/osct/?s=BK1");
    expect(legacyRedirect("/", "?s=d1", "", options)).toBe("/demo/?s=d1");
    expect(legacyRedirect("/scene/s1", "?s=d1&osct=6.0.0", "", options)).toBe("/demo/scene/s1?s=d1&osct=6.0.0");
  });

  it("an unknown source, the landing page's lp1 and a route without one open the default experience at the same route", () => {
    expect(legacyRedirect("/", "?s=fl1", "", options)).toBe("/osct/?s=fl1");
    expect(legacyRedirect("/", "?s=lp1", "", options)).toBe("/osct/?s=lp1");
    expect(legacyRedirect("/scene/s1", "", "", options)).toBe("/osct/scene/s1");
    expect(legacyRedirect("/entry/racoon", "?osct=5.2.0", "#top", options)).toBe("/osct/entry/racoon?osct=5.2.0#top");
    expect(legacyRedirect("/entries/category/video", "", "", options)).toBe("/osct/entries/category/video");
    expect(legacyRedirect("/about", "?login=abc", "", options)).toBe("/osct/about?login=abc");
    expect(legacyRedirect("/info", "", "", options)).toBe("/osct/info");
  });

  it("a bare / opens the experience this browser opened last (the installed app), else the default", () => {
    expect(legacyRedirect("/", "", "", { fallback: "osct", last: "demo" })).toBe("/demo/");
    expect(legacyRedirect("/", "?osct=6.0.0", "", { fallback: "osct", last: "demo" })).toBe("/demo/?osct=6.0.0");
    expect(legacyRedirect("/", "", "", options)).toBe("/osct/");
    expect(legacyRedirect("/", "", "", { fallback: "osct", last: "editor" })).toBe("/osct/");
    // a route keeps the default – the last experience is for the start only
    expect(legacyRedirect("/scene/s1", "", "", { fallback: "osct", last: "demo" })).toBe("/osct/scene/s1");
  });

  it("the old prefix /x/<experience>/… moves to /<experience>/…", () => {
    expect(legacyRedirect("/x/demo/scene/s1", "?osct=6.0.0", "", options)).toBe("/demo/scene/s1?osct=6.0.0");
    expect(legacyRedirect("/x/demo", "", "", options)).toBe("/demo/");
    expect(legacyRedirect("/x/demo/", "?s=bk1", "", options)).toBe("/demo/?s=bk1");
  });

  it("an address with an experience stays; without any experience known (bundled content) every address stays", () => {
    expect(legacyRedirect("/osct/scene/s1", "?s=d1", "", options)).toBeNull();
    expect(legacyRedirect("/demo/", "", "", options)).toBeNull();
    expect(legacyRedirect("/scene/s1", "", "", { fallback: null, last: null })).toBeNull();
    expect(legacyRedirect("/", "", "", { fallback: null, last: null })).toBeNull();
  });
});

describe("the experience opened last (the installed app's start)", () => {
  afterEach(() => localStorage.clear());

  it("is remembered per browser and read back; a stored reserved or bad id is none", () => {
    expect(lastExperience()).toBeNull();
    rememberExperience("demo");
    expect(localStorage.getItem(LAST_EXPERIENCE_KEY)).toBe("demo");
    expect(lastExperience()).toBe("demo");
    localStorage.setItem(LAST_EXPERIENCE_KEY, "scene");
    expect(lastExperience()).toBeNull();
  });

  it("moves the address with replaceState before anything reads it", () => {
    rememberExperience("demo");
    const replaced: string[] = [];
    const win = {
      location: { pathname: "/", search: "?s=bk1", hash: "" },
      history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) },
    } as unknown as Window;
    expect(redirectLegacyAddress(win)).toBe("/osct/?s=bk1");
    expect(replaced).toEqual(["/osct/?s=bk1"]);
    const stays = { ...win, location: { pathname: "/demo/about", search: "", hash: "" } } as unknown as Window;
    expect(redirectLegacyAddress(stays)).toBeNull();
  });
});
