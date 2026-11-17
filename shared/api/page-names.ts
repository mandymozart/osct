import type { BookPage, PageAddress } from "./editor";

/**
 * Which page a file belongs to by its name (#251) – the editor's bulk upload of page images and the MCP server's
 * `set_page_images` read names the same way (docs/editor.md "Pages"). Case does not matter, the extension is ignored:
 *
 * - a numbered page: `P012…`, `p12`, `pp-012`, `page-12`, `page12`, `012`, `12` (digits after a prefix, anything after a
 *   non-digit ignored: `P012_Print.jpg` is page 12);
 * - the unnumbered half next to a single page: `P001-facing`, `page-256-facing`;
 * - the covers: `cover`, `front-cover`, `cover-front` · `back`, `back-cover`, `cover-back`;
 * - front and back matter by their labels: `F1` … (the first page after the cover) and `B1` … (the first after the last
 *   printed page's sheet);
 * - by order, as the print PDFs come: `start-1` … every page before page 1 from the cover on (the cover, the front matter,
 *   the half next to page 1), and `end-1` … every page after the last printed page to the back cover (the half next to
 *   it, the back matter, the back cover).
 */

/** A page's key: `12`, `-3`, `1f` (the half next to page 1) – the same as the API's `Pages::key` */
export const pageKey = (page: PageAddress): string => `${page.page}${page.facing ? "f" : ""}`;

/** A file name without its folder and extension, lower case */
const stem = (name: string): string =>
  name
    .replace(/^.*[\\/]/, "")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .trim()
    .toLowerCase();

/** The pages before the first numbered page and after the last one, in book order */
const ends = (pages: readonly BookPage[]): { start: BookPage[]; end: BookPage[] } => {
  const numbered = pages.map((page, i) => (page.kind === "page" ? i : -1)).filter(i => i >= 0);
  if (!numbered.length) return { start: [], end: [] };
  return { start: pages.slice(0, numbered[0]), end: pages.slice(numbered[numbered.length - 1] + 1) };
};

/** The page a file name names, null when it names none of `pages` */
export const pageOfName = (name: string, pages: readonly BookPage[]): BookPage | null => {
  const s = stem(name);
  const find = (test: (page: BookPage) => boolean) => pages.find(test) ?? null;
  if (/^(front[-_ ]?)?cover([-_ ]?front)?$/.test(s)) return find(page => page.kind === "cover");
  if (/^(back|back[-_ ]?cover|cover[-_ ]?back)$/.test(s)) return find(page => page.kind === "back");
  const label = /^([fb])[-_ ]?0*(\d+)$/.exec(s);
  if (label) return find(page => page.label.toLowerCase() === `${label[1]}${Number(label[2])}`);
  const order = /^(start|end)[-_ ]?0*(\d+)$/.exec(s);
  if (order) {
    const { start, end } = ends(pages);
    return (order[1] === "start" ? start : end)[Number(order[2]) - 1] ?? null;
  }
  const facing = /^(?:pp|p|page)?[-_ ]?0*(\d+)[-_ ]?facing$/.exec(s);
  if (facing) return find(page => page.facing && page.page === Number(facing[1]));
  const numbered = /^(?:pp|p|page)?[-_ ]?0*(\d+)(?:\D.*)?$/.exec(s);
  if (numbered) return find(page => page.kind === "page" && page.page === Number(numbered[1]));
  return null;
};

/** A file's proposed page: null when the name names none; `duplicate` when an earlier file of the list already took it */
export interface NameMatch {
  name: string;
  page: BookPage | null;
  duplicate: boolean;
}

/** Every file's page by its name, in the files' order */
export const matchNames = (names: readonly string[], pages: readonly BookPage[]): NameMatch[] => {
  const taken = new Set<string>();
  return names.map(name => {
    const page = pageOfName(name, pages);
    const key = page ? pageKey(page) : null;
    const duplicate = key !== null && taken.has(key);
    if (key) taken.add(key);
    return { name, page, duplicate };
  });
};
