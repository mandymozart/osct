import { describe, expect, it } from 'vitest';
import { listenSource, listenStored, shortDiff, type PluginSourcesApi } from '../src/lib/plugins-listen';

const SOURCE = `/** Hums when it hears doorOpened – the rule's hearing */
export function register(api) {
  // hears the door, sets hummed
  const heard = [];
  api.registerComponent("hum", {
    description: "Hums when it hears doorOpened",
    params: {},
    uses: { hears: ["doorOpened"], sets: ["hummed"] },
  }, () => {
    api.events.on("doorOpened", p => heard.push(p));
  });
  const spec = { uses: { "hears": ['x'], hears  : [] } };
  return spec.uses.hears ?? heard;
}
`;

describe('osct plugins listen (#341, plugin API 4.0)', () => {
  it('renames the key, the property and the quoted key; the words in comments and strings; leaves identifiers', () => {
    const after = listenSource(SOURCE);
    expect(after).toContain('/** Hums when it listens to doorOpened – the rule\'s listening to */');
    expect(after).toContain('// listens to the door, sets hummed');
    expect(after).toContain('const heard = [];');
    expect(after).toContain('description: "Hums when it listens to doorOpened"');
    expect(after).toContain('uses: { listens: ["doorOpened"], sets: ["hummed"] }');
    expect(after).toContain(`const spec = { uses: { "listens": ['x'], listens  : [] } };`);
    expect(after).toContain('return spec.uses.listens ?? heard;');
    expect(after.split('\n')).toHaveLength(SOURCE.split('\n').length);
    expect(listenSource(after)).toBe(after);
  });

  it('keeps a source without the word as it is', () => {
    const plain = 'export const register = api => api.events.on("ping", () => {}); // "a/b" `c`';
    expect(listenSource(plain)).toBe(plain);
  });

  it('the short diff names the changed lines', () => {
    expect(shortDiff('a\n  uses: { hears: [] }\nb', 'a\n  uses: { listens: [] }\nb')).toEqual(['   2 - uses: { hears: [] }', '   2 + uses: { listens: [] }']);
  });

  it('reads every source through the API and writes the changed ones back – not in a dry run', async () => {
    const stored: Record<string, Record<string, string>> = { demo: { hum: SOURCE, tint: 'export const register = () => {};' }, osct: {} };
    const puts: string[] = [];
    const api: PluginSourcesApi = {
      experiences: async () => Object.keys(stored),
      plugins: async experience => Object.keys(stored[experience]),
      source: async (experience, plugin) => stored[experience][plugin],
      put: async (experience, plugin, source) => {
        puts.push(`${experience}/${plugin}`);
        stored[experience][plugin] = source;
      },
    };
    const dry = await listenStored(api, ['demo', 'osct'], true);
    expect(dry.checked).toBe(2);
    expect(dry.changes.map(c => `${c.experience}/${c.plugin}`)).toEqual(['demo/hum']);
    expect(puts).toEqual([]);
    await listenStored(api, ['demo'], false);
    expect(puts).toEqual(['demo/hum']);
    expect(stored.demo.hum).toContain('listens: ["doorOpened"]');
    expect((await listenStored(api, ['demo'], false)).changes).toEqual([]);
  });
});
