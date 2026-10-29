import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, entry, loadBuild, makeContent, spread } from './helpers';

afterEach(() => vi.unstubAllEnvs());

const TINT = `import type { PluginApi } from "osct-plugin-api";
export const register = (api: PluginApi): void => {
  api.registerLayer("tint", {
    description: "Tints.",
    nodeTypes: ["video"],
    params: { opacity: { kind: "number", default: 0.3, min: 0, max: 1, description: "How much." } },
  }, { glsl: "return mix(rgba, vec4(1.0, 0.8, 0.5, rgba.a), opacity);" });
};
`;

const video = (components: string) => entry(1, 'x.jpg', `  entity:\n    type: video\n    src: v.mp4\n${components}`);

const content = (plugin: string, components = '    components:\n      - type: tint\n        opacity: 0.5\n') => ({
  'book.yaml': BOOK,
  'spreads/a/spread.yaml': spread(1, 2),
  'entries/first/entry.yaml': video(components),
  'entries/first/x.jpg': 'image x',
  'entries/first/v.mp4': 'video',
  'plugins/tint/index.ts': plugin,
});

describe('plugins (the book\'s own code)', () => {
  it('type-checks, bundles and records a plugin; the nodes that use its layer pass; the bundle lands in the output', async () => {
    const dirs = makeContent(content(TINT));
    const build = await loadBuild(dirs);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugins = await build.plugins.buildPlugins();
    const { entries } = build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(plugins.map(p => p.data)).toEqual([{ id: 'tint', src: '/assets/content/plugins/tint/plugin.js', api: '1.0' }]);
    expect(plugins[0].code).toContain('registerLayer("tint"');
    expect(plugins[0].code).not.toContain('osct-plugin-api');
    expect(entries[0].target?.entity).toMatchObject({ components: [{ type: 'tint', opacity: 0.5 }] });
    // The bundle is written next to the copied source
    vi.stubEnv('OSCT_CONTENT_DIR', dirs.content);
    const { CLIENT_PUBLIC_ASSETS_DIR } = await import('../src/config');
    const out = path.join(path.dirname(CLIENT_PUBLIC_ASSETS_DIR), 'content-plugins-test');
    vi.spyOn(fs, 'mkdirSync');
    build.plugins.writePluginBundles(plugins.map(p => ({ ...p, data: { ...p.data } })));
    expect(fs.existsSync(path.join(CLIENT_PUBLIC_ASSETS_DIR, 'plugins/tint/plugin.js'))).toBe(true);
    fs.rmSync(path.join(CLIENT_PUBLIC_ASSETS_DIR, 'plugins/tint'), { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }, 30000);

  it('a node using a component no plugin provides is an error', async () => {
    const build = await loadBuild(makeContent({ ...content(TINT), 'plugins/tint/index.ts': TINT.replace('"tint"', '"glow"') }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await build.plugins.buildPlugins();
    build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual(['entries/first target: components[0].type: "tint" is not one of animation, glow']);
  }, 30000);

  it('reports type errors with file and line, an import, a bad spec and a bad folder name', async () => {
    const build = await loadBuild(makeContent({
      ...content(TINT, ''),
      'plugins/tint/index.ts': TINT.replace('default: 0.3', 'default: "no"'),
      'plugins/Glow/index.ts': TINT,
      'plugins/empty/readme.md': 'no entry',
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await build.plugins.buildPlugins();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([
      'plugins/Glow: a plugin folder is named with lower-case letters, digits and - (e.g. tint)',
      'plugins/empty: missing index.ts',
      expect.stringMatching(/^plugins\/tint\/index\.ts\(6,\d+\): Type .* is not assignable to type 'ComponentParamSpec'/),
    ]);

    const imports = await loadBuild(makeContent(content(`import { Group } from "three";\nexport const register = () => new Group();\n`)));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await imports.plugins.buildPlugins();
    vi.restoreAllMocks();
    expect(imports.errors).toEqual(['plugins/tint/index.ts(1,23): a plugin imports nothing – "three" is not available; three.js is api.three, types with `import type`']);

    const badSpec = await loadBuild(makeContent(content(TINT.replace('min: 0, max: 1', 'min: 2, max: 1'))));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await badSpec.plugins.buildPlugins();
    vi.restoreAllMocks();
    expect(badSpec.errors).toEqual(['plugins/tint: tint.opacity: a number needs min ≤ default ≤ max']);
  }, 60000);

  it('a register that throws, or a module without one, is an error', async () => {
    const build = await loadBuild(makeContent(content('export const register = () => { throw new Error("boom"); };\n')));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await build.plugins.buildPlugins();
    vi.restoreAllMocks();
    expect(build.errors).toEqual(['plugins/tint: register failed – boom']);
    const none = await loadBuild(makeContent(content('export const nothing = 1;\n')));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await none.plugins.buildPlugins();
    vi.restoreAllMocks();
    expect(none.errors).toEqual(['plugins/tint: index.ts exports no register(api) function']);
  }, 30000);
});
