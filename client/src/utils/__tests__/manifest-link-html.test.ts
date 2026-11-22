import { describe, expect, it } from "vitest";
import { API_URL } from "@/services/ApiService";
import { experienceManifestUrl } from "../experience-meta";
import { splitExperiencePath } from "../experience-path";
import { manifestLinkData, manifestLinkSource, renderManifestLink, ROOT_MANIFEST, withoutBuildManifestLink } from "../manifest-link-html";

/** The inline manifest link in index.html (#343) links what experience-meta.ts links, for every address */
const run = (path: string) => {
  document.head.innerHTML = "";
  const fn = new Function(`return ${manifestLinkSource(manifestLinkData())}`)() as (loc: Pick<Location, "pathname">, doc: Document) => string;
  const href = fn({ pathname: path }, document);
  return { href, links: Array.from(document.head.querySelectorAll('link[rel="manifest"]')).map(link => link.getAttribute("href")) };
};

const PATHS = ["/osct/", "/osct/scene/s1", "/demo/", "/Demo_2/about", "/", "/scene/s1x/", "/editor/", "/%E0%A4%A/", "/workbox-1/", "/a%20b/"];

describe("the inline manifest link", () => {
  it.each(PATHS)("%s links the manifest experience-meta would", path => {
    const experience = splitExperiencePath(path).experience;
    const expected = experience ? experienceManifestUrl(experience) : ROOT_MANIFEST;
    expect(run(path)).toEqual({ href: expected, links: [expected] });
  });

  it("the default experience gets its own manifest too, a bare / the build's", () => {
    expect(run("/osct/").href).toBe("/api/experiences/osct/manifest.webmanifest");
    expect(run("/").href).toBe("/manifest.webmanifest");
  });

  it("repeats ApiService's API_URL", () => {
    expect(manifestLinkData().api).toBe(API_URL);
  });

  it("is one script tag that never throws; the build's own link is taken out", () => {
    const html = renderManifestLink(manifestLinkData());
    expect(html.startsWith("<script>try {")).toBe(true);
    expect(html.endsWith("} catch (e) {}</script>")).toBe(true);
    expect(withoutBuildManifestLink('<head><link rel="manifest" href="/manifest.webmanifest"></head>')).toBe("<head></head>");
    expect(withoutBuildManifestLink('<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials">')).toBe("");
  });
});
