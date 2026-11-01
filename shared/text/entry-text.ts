/**
 * An entry's body as the reader shows it (content schema 2.23): a small Markdown with the book's variables – one
 * renderer for the reader's entry view and the editor's preview, so the author sees what the reader will.
 *
 * - **Variables** first (`./expressions.ts`, the syntax of SCUTOONS' message boxes): `{hasKey}`, `{tries > 2: …|…}`. A
 *   variable that is not set shows as nothing – a fallback is a conditional, `{name: {name}|friend}`.
 * - **Markdown** then, only this much: paragraphs (a blank line between two; a single line break stays a line break, as
 *   plain text always showed), `*emphasis*` / `_emphasis_`, `**strong**` / `__strong__`, `[links](https://…)` (http,
 *   https and mailto – any other link stays text) and backslash escapes (`\*` is a star). Nothing else is markup: no
 *   headings, lists, images, code or HTML.
 * - **Everything is escaped**: no HTML passes through. The only elements written are `p`, `br`, `em`, `strong` and `a`
 *   with an `href` that was checked; a variable's value is text, never markup.
 *
 * Plain text is valid Markdown and reads as it did: an older app shows the source as it is (the stars and brackets
 * included, its variables in braces – `docs/content.md`).
 */
import { evaluateText, type ExprProblem, type VariableLookup } from "./expressions";

export { exprMessage, textVariables, type ExprProblem, type VariableLookup } from "./expressions";

export interface EntryTextOptions {
  /** The variables' values (undefined = not set); none: every variable is unset */
  variables?: VariableLookup;
  /** Links open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`) – the default */
  newTab?: boolean;
}

export interface RenderedText {
  /** Safe HTML: paragraphs with em, strong, br and checked links */
  html: string;
  /** What could not be evaluated or is not set (the editor lists them; the reader ignores them) */
  problems: ExprProblem[];
}

/** The characters a backslash escapes in Markdown (ASCII punctuation) */
const PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text for an element or an attribute: every character HTML could read as markup escaped */
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

/** A link's target when it may be one: http(s) with a host, or mailto with an address – else null */
export const safeLinkUrl = (raw: string): string | null => {
  const url = raw.trim();
  if (!url || /[\u0000- \u007f]/.test(url)) return null;
  if (/^mailto:[^@\s]+@[^@\s]+$/i.test(url)) return url;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname ? url : null;
  } catch {
    return null;
  }
};

const isSpace = (c: string | undefined): boolean => c === undefined || /\s/.test(c);
const isWordChar = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** One paragraph's inline Markdown → HTML */
function inline(source: string, newTab: boolean): string {
  /** Searches for a closer that found none from this index on (per delimiter and range): later openers need not search again */
  const failed = new Map<string, number>();

  /** The `]` that closes the link text opened at `open`, with `(url)` right after it – null when it is no link */
  const link = (open: number, end: number): { textEnd: number; url: string; next: number } | null => {
    let depth = 0;
    for (let j = open + 1; j < end; j++) {
      const c = source[j];
      if (c === "\\") j++;
      else if (c === "[") depth++;
      else if (c === "]" && depth-- === 0) {
        if (source[j + 1] !== "(" || j === open + 1) return null;
        const close = source.indexOf(")", j + 2);
        if (close < 0 || close >= end) return null;
        const url = source.slice(j + 2, close);
        return /\s/.test(url.trim()) ? null : { textEnd: j, url: url.trim(), next: close + 1 };
      }
    }
    return null;
  };

  /** Where the closing run of `count` × `mark` is, between `from` and `end`; -1 when there is none */
  const closer = (from: number, end: number, mark: string, count: number): number => {
    const key = `${mark}${count}:${end}`;
    const known = failed.get(key);
    if (known !== undefined && from >= known) return -1;
    for (let j = from; j < end; j++) {
      const c = source[j];
      if (c === "\\") {
        j++;
        continue;
      }
      if (c !== mark) continue;
      let run = 1;
      while (source[j + run] === mark && j + run < end) run++;
      const fits = count === 2 ? run >= 2 : run === 1;
      if (fits && j > from && !isSpace(source[j - 1]) && !(mark === "_" && isWordChar(source[j + count]))) return j;
      j += run - 1;
    }
    failed.set(key, Math.min(from, known ?? from));
    return -1;
  };

  const render = (start: number, end: number, links: boolean): string => {
    let out = "";
    let i = start;
    while (i < end) {
      const c = source[i];
      if (c === "\\" && i + 1 < end && PUNCTUATION.includes(source[i + 1])) {
        out += escapeHtml(source[i + 1]);
        i += 2;
        continue;
      }
      if (c === "\n") {
        out += "<br>";
        i++;
        continue;
      }
      if (c === "[" && links) {
        const found = link(i, end);
        const url = found ? safeLinkUrl(found.url) : null;
        if (found && url) {
          const target = newTab ? ' target="_blank" rel="noopener noreferrer"' : "";
          out += `<a href="${escapeHtml(url)}"${target}>${render(i + 1, found.textEnd, false)}</a>`;
          i = found.next;
          continue;
        }
      }
      if (c === "*" || c === "_") {
        let run = 1;
        while (source[i + run] === c && i + run < end) run++;
        const opens = (width: number) => !isSpace(source[i + width]) && !(c === "_" && isWordChar(source[i - 1]));
        if (run >= 2 && opens(2)) {
          const close = closer(i + 2, end, c, 2);
          if (close >= 0) {
            out += `<strong>${render(i + 2, close, links)}</strong>`;
            i = close + 2;
            continue;
          }
        }
        if (opens(1)) {
          const close = closer(i + 1, end, c, 1);
          if (close >= 0) {
            out += `<em>${render(i + 1, close, links)}</em>`;
            i = close + 1;
            continue;
          }
        }
        out += c.repeat(run);
        i += run;
        continue;
      }
      out += escapeHtml(c);
      i++;
    }
    return out;
  };

  return render(0, source.length, true);
}

/** Markdown (the subset above) → safe HTML paragraphs */
export function markdownToHtml(markdown: string, { newTab = true }: { newTab?: boolean } = {}): string {
  return String(markdown ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${inline(p, newTab)}</p>`)
    .join("");
}

/** An entry's body → its HTML: the variables filled in, then the Markdown */
export function renderEntryText(body: string, { variables = () => undefined, newTab = true }: EntryTextOptions = {}): RenderedText {
  const evaluated = evaluateText(String(body ?? ""), variables);
  return { html: markdownToHtml(evaluated.text, { newTab }), problems: evaluated.problems };
}

/**
 * The lookup over a snapshot of the variables in their scopes (the plugin runtime's `allVars()`): a name reads the
 * innermost scope that has it – spread, stage, session, book – like a plugin's `api.vars.get(name)`
 */
export function variablesOf(snapshot: ReadonlyArray<{ scope: string; name: string; value: unknown }>): VariableLookup {
  const order = ["spread", "stage", "session", "book"];
  const byName = new Map<string, { rank: number; value: unknown }>();
  for (const v of snapshot) {
    const rank = order.indexOf(v.scope) < 0 ? order.length : order.indexOf(v.scope);
    const known = byName.get(v.name);
    if (!known || rank < known.rank) byName.set(v.name, { rank, value: v.value });
  }
  return name => byName.get(name)?.value;
}
