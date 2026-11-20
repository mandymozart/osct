import { describe, expect, it } from "vitest";
import { activeExperience, contentBaseUrl, defaultExperience, experiencePrefix, splitExperiencePath } from "../experience-path";

// Several experiences on one installation (#87): the default without a prefix, every other one below /x/<experience>
describe("the experience in the address", () => {
  it("splits /x/<experience> off the route; anything else is the route itself", () => {
    expect(splitExperiencePath("/x/demo/scene/s2")).toEqual({ experience: "demo", path: "/scene/s2" });
    expect(splitExperiencePath("/x/demo")).toEqual({ experience: "demo", path: "/" });
    expect(splitExperiencePath("/x/My_Book/")).toEqual({ experience: "My_Book", path: "/" });
    expect(splitExperiencePath("/scene/s2")).toEqual({ experience: null, path: "/scene/s2" });
    expect(splitExperiencePath("/x")).toEqual({ experience: null, path: "/x" });
    expect(splitExperiencePath("/x/a%20b/about")).toEqual({ experience: null, path: "/x/a%20b/about" });
    expect(splitExperiencePath("/x/%E0%A4%A/about").experience).toBeNull();
  });

  it("the default experience: the build's VITE_EXPERIENCE, else none", () => {
    expect(defaultExperience("osct")).toBe("osct");
    expect(defaultExperience(" ")).toBeNull();
    expect(defaultExperience(undefined)).toBeNull();
    expect(activeExperience("/x/demo/about", "osct")).toBe("demo");
    expect(activeExperience("/scene/s1", "osct")).toBe("osct");
    expect(activeExperience("/", null)).toBeNull();
  });

  it("writes the prefix only for another experience than the default", () => {
    expect(experiencePrefix("demo", "osct")).toBe("/x/demo");
    expect(experiencePrefix("osct", "osct")).toBe("");
    expect(experiencePrefix(null, "osct")).toBe("");
  });

  it("loads the experience's store below the environment's CDN URL; none without one (bundled content)", () => {
    expect(contentBaseUrl("https://cdn.example/osct/staging/", "demo")).toBe("https://cdn.example/osct/staging/demo");
    expect(contentBaseUrl("", "demo")).toBe("");
    expect(contentBaseUrl("https://cdn.example/osct/staging", null)).toBe("");
  });
});
