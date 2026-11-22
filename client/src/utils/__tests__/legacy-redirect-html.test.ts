import { describe, expect, it } from "vitest";
import { legacyRedirect, LAST_EXPERIENCE_KEY, LEGACY_SEGMENT } from "../experience-path";
import { legacyRedirectData, legacyRedirectSource, renderLegacyRedirect } from "../legacy-redirect-html";

/** The inline redirect in index.html (#343) moves every address exactly as the app's `legacyRedirect` would */
const run = (path: string, last: string | null, fallback = "osct") => {
  const url = new URL(path, "https://osct.example");
  const replaced: string[] = [];
  const fn = new Function(`return ${legacyRedirectSource(legacyRedirectData(fallback))}`)() as (
    loc: Pick<Location, "pathname" | "search" | "hash">, hist: Pick<History, "state" | "replaceState">, store: Pick<Storage, "getItem"> | null,
  ) => string | null;
  const result = fn(
    { pathname: url.pathname, search: url.search, hash: url.hash },
    { state: null, replaceState: (_s: unknown, _t: string, to?: string | URL | null) => { replaced.push(String(to)); } },
    { getItem: (key: string) => (key === LAST_EXPERIENCE_KEY ? last : null) },
  );
  return { result, replaced };
};

const CASES: Array<[string, string | null]> = [
  ["/?s=bk1", null], ["/?s=BK1", null], ["/?s=d1", null], ["/?s=lp1", null], ["/?s=d1&osct=6.1.0#x", null],
  ["/", null], ["/", "demo"], ["/", "editor"], ["/?s=bk1", "demo"],
  ["/scene/s2-3?osct=6.0.0", null], ["/scene/s1?s=d1", null], ["/entry/p4-1", "demo"], ["/about", null],
  ["/x/demo/about", null], ["/x/demo/", null], ["/x/editor/", null],
  ["/osct/", null], ["/demo/scene/s1", null], ["/Demo_2/", null], ["/%E0%A4%A/", null],
];

describe("the inline legacy redirect", () => {
  it.each(CASES)("%s (last opened: %s) moves as legacyRedirect does", (path, last) => {
    const url = new URL(path, "https://osct.example");
    const expected = legacyRedirect(url.pathname, url.search, url.hash, { fallback: "osct", last });
    const { result, replaced } = run(path, last);
    expect(result).toBe(expected);
    expect(replaced).toEqual(expected === null ? [] : [expected]);
  });

  it("knows no default without one: a bare / with nothing remembered stays", () => {
    expect(run("/", null, "").result).toBeNull();
  });

  it("repeats experience-path's constants", () => {
    const data = legacyRedirectData("osct");
    expect(data.lastKey).toBe(LAST_EXPERIENCE_KEY);
    expect(data.legacy).toBe(LEGACY_SEGMENT);
  });

  it("is one script tag that never throws", () => {
    const html = renderLegacyRedirect(legacyRedirectData("osct"));
    expect(html.startsWith("<script>try {")).toBe(true);
    expect(html.endsWith("} catch (e) {}</script>")).toBe(true);
  });
});
