/**
 * Plugin API 4.0 / content schema 6.0 (#341, Tilman 2026-11-21: "you use the word hear for events. i think it is
 * listen"): a plugin source's spec names what its code listens to `uses.listens` (was `uses.hears`). `osct plugins listen`
 * rewrites the stored sources – a content source folder's `plugins/<id>/index.ts` (`--dir`) or an instance's sources
 * through the editor API (`--experience` / `--all`) – with a dry run that prints a short diff per plugin.
 *
 * The source is read as code, comments and string literals (a light scanner – no parser):
 * - in code: the key `hears` (`hears:`, `hears?:`) and a property `.hears` → `listens`;
 * - a string literal that is just `hears` (`"hears": […]`) → `"listens"`;
 * - in comments and string literals: the words – hears → listens to, hear → listen to, heard → listened to, hearing →
 *   listening to (capitalised the same) – so a spec's description reads like the editor's own words.
 * Identifiers in code (a variable `heard`) are left as they are; the API names no other "hear" (the runtime's
 * `api.events.on` stays). A second run changes nothing.
 */

const WORDS: [RegExp, string][] = [
  [/\bHeard\b/g, 'Listened to'], [/\bheard\b/g, 'listened to'],
  [/\bHearing\b/g, 'Listening to'], [/\bhearing\b/g, 'listening to'],
  [/\bHears\b/g, 'Listens to'], [/\bhears\b/g, 'listens to'],
  [/\bHear\b/g, 'Listen to'], [/\bhear\b/g, 'listen to'],
];

/** Prose: the words, without doubling a "to" that follows already */
function words(text: string): string {
  let out = text;
  for (const [pattern, to] of WORDS) out = out.replace(pattern, to);
  return out.replace(/\b(listens|listen|listened|listening) to to\b/gi, '$1 to');
}

/** Code (no comment, no string): the key and the property */
function code(text: string): string {
  return text.replace(/(?<![\w$])hears(?=\s*\??\s*:)/g, 'listens').replace(/(?<=\.\s*)hears(?![\w$])/g, 'listens');
}

/** A string literal with its quotes */
function literal(text: string): string {
  const quote = text[0];
  const body = text.slice(1, -1);
  if (body === 'hears') return `${quote}listens${quote}`;
  return quote + words(body) + quote;
}

/** The source with `uses.hears` → `uses.listens` and the words in comments and strings (see above) */
export function listenSource(source: string): string {
  let out = '';
  let start = 0;
  let i = 0;
  const flush = (end: number) => {
    out += code(source.slice(start, end));
  };
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      flush(i);
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += words(source.slice(i, stop));
      i = start = stop;
    } else if (c === '/' && next === '*') {
      flush(i);
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += words(source.slice(i, stop));
      i = start = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      flush(i);
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\\') j++;
        else if (c !== '`' && source[j] === '\n') break;
        j++;
      }
      const stop = Math.min(j + 1, source.length);
      out += literal(source.slice(i, stop));
      i = start = stop;
    } else {
      i++;
    }
  }
  flush(source.length);
  return out;
}

/** A short diff of two texts: the changed lines, `-` before and `+` after, with their line numbers */
export function shortDiff(before: string, after: string): string[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const lines: string[] = [];
  // The rewrite never adds or removes a line, so the lines pair up
  for (let n = 0; n < Math.max(a.length, b.length); n++) {
    if (a[n] === b[n]) continue;
    if (a[n] !== undefined) lines.push(`${String(n + 1).padStart(4)} - ${a[n].trim()}`);
    if (b[n] !== undefined) lines.push(`${String(n + 1).padStart(4)} + ${b[n].trim()}`);
  }
  return lines;
}

/** One plugin's source, rewritten (or not) */
export interface ListenChange {
  experience: string;
  plugin: string;
  before: string;
  after: string;
}

/** What the editor API offers the command (a fake in the tests) */
export interface PluginSourcesApi {
  experiences(): Promise<string[]>;
  plugins(experience: string): Promise<string[]>;
  source(experience: string, plugin: string): Promise<string>;
  put(experience: string, plugin: string, source: string): Promise<void>;
}

/** The editor API's plugin routes with a person's token */
export function pluginSourcesApi(api: string, token: string, fetcher: typeof fetch = fetch): PluginSourcesApi {
  const call = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const response = await fetcher(`${api}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${(await response.text().catch(() => '')).slice(0, 300)}`);
    return response.json();
  };
  const at = (experience: string, plugin?: string) =>
    `/editor/experiences/${encodeURIComponent(experience)}/plugins${plugin ? `/${encodeURIComponent(plugin)}` : ''}`;
  return {
    experiences: async () => ((await call('/editor/experiences')) as { experiences: { id: string }[] }).experiences.map(e => e.id),
    plugins: async experience => ((await call(at(experience))) as { plugins: { id: string }[] }).plugins.map(p => p.id),
    source: async (experience, plugin) => ((await call(at(experience, plugin))) as { plugin: { source: string } }).plugin.source,
    put: async (experience, plugin, source) => {
      await call(at(experience, plugin), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) });
    },
  };
}

/** Reads every plugin source of the experiences, rewrites it, and – unless `dryRun` – stores the changed ones back */
export async function listenStored(api: PluginSourcesApi, experiences: string[], dryRun: boolean): Promise<{ changes: ListenChange[]; checked: number }> {
  const changes: ListenChange[] = [];
  let checked = 0;
  for (const experience of experiences) {
    for (const plugin of await api.plugins(experience)) {
      const before = await api.source(experience, plugin);
      checked++;
      const after = listenSource(before);
      if (after === before) continue;
      changes.push({ experience, plugin, before, after });
      if (!dryRun) await api.put(experience, plugin, after);
    }
  }
  return { changes, checked };
}
