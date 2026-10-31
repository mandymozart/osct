import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, entry, loadBuild, makeContent, spread } from './helpers';
import { PLUGIN_API_VERSION } from '../../shared/types/plugins';

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
    // What it registered is recorded (schema 2.14): the layer's spec, no node types, no passes
    expect(plugins.map(p => p.data)).toEqual([{
      id: 'tint', src: '/assets/content/plugins/tint/plugin.js', api: PLUGIN_API_VERSION,
      registered: {
        components: { tint: { description: 'Tints.', nodeTypes: ['video'], params: { opacity: { kind: 'number', default: 0.3, min: 0, max: 1, description: 'How much.' } } } },
        nodeTypes: {},
        passes: {},
      },
    }]);
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

  it('warns about a node that stacks more than three layers', async () => {
    const four = '    components:\n' + ['tint', 'tint', 'tint', 'tint'].map(t => `      - type: ${t}\n`).join('');
    const build = await loadBuild(makeContent(content(TINT, four)));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await build.plugins.buildPlugins();
    build.plugins.warnLayerStacks(build.buildAll().entries.flatMap(e => (e.target?.entity && !('ref' in e.target.entity) ? [{ label: `entries/${e.id} target`, node: e.target.entity }] : [])));
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(build.warnings).toEqual(['entries/first target: 4 material layers on one node (tint, tint, tint, tint) – every layer runs on every pixel; bake what never changes into the video']);
  }, 30000);

  it('a node using a component no plugin provides is an error', async () => {
    const build = await loadBuild(makeContent({ ...content(TINT), 'plugins/tint/index.ts': TINT.replace('"tint"', '"glow"') }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await build.plugins.buildPlugins();
    build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual(['entries/first target: components[0].type: "tint" is not one of animation, behaviour, glow']);
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

/** A plugin with two node types (API 1.2): a fileless sparkle and a poster that takes an image */
const NODES = `import type { PluginApi } from "osct-plugin-api";
export const register = (api: PluginApi): void => {
  api.registerNodeType("sparkle", {
    description: "Points.",
    params: {
      count: { kind: "number", default: 50, min: 1, max: 500, description: "How many." },
      color: { kind: "color", default: "#ffffff", description: "Their colour." },
    },
  }, ({ params, three }) => ({ object: new three.Points(new three.BufferGeometry(), new three.PointsMaterial({ color: String(params.color) })) }));
  api.registerNodeType("poster", { description: "A picture on a stand.", src: "image", params: {} }, ({ three }) => ({ object: new three.Group() }));
};
`;

const nodeContent = (entity: string, plugin = NODES) => ({
  'book.yaml': BOOK,
  'spreads/a/spread.yaml': spread(1, 2),
  'entries/first/entry.yaml': entry(1, 'x.jpg', `  entity:\n${entity}`),
  'entries/first/x.jpg': 'image x',
  'entries/first/p.jpg': 'image p',
  'entries/first/v.mp4': 'video',
  'plugins/nodes/index.ts': plugin,
});

describe('a plugin\'s node types', () => {
  it('pass the build with their parameters in params, a file of their kind, children and components', async () => {
    const build = await loadBuild(makeContent(nodeContent([
      '    type: group',
      '    children:',
      '      - type: sparkle',
      '        params: { position: [0, 0.1, 0], count: 120, color: "#ffe2a8" }',
      '      - type: poster',
      '        src: p.jpg',
      '        children:',
      '          - type: text',
      '            text: hello',
      '',
    ].join('\n'))));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await build.plugins.buildPlugins();
    const { entries } = build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    const root = entries[0].target?.entity as { children: unknown[] };
    expect(root.children[0]).toMatchObject({ type: 'sparkle', assets: [], params: { position: [0, 0.1, 0], count: 120, color: '#ffe2a8' } });
    expect(root.children[1]).toMatchObject({ type: 'poster', assets: [{ assetType: 'image' }], children: [{ type: 'text' }] });
  }, 30000);

  it('records the node types and a pass in the configuration, which the shared guard then checks', async () => {
    const withPass = NODES.replace('};\n', '  api.registerPass("scan", { description: "Scan lines.", params: { lines: { kind: "number", default: 200, min: 10, max: 800, description: "How many." } } }, () => ({}) as never);\n};\n');
    const build = await loadBuild(makeContent(nodeContent('    type: sparkle\n    params: { count: 10 }\n', withPass)));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugins = await build.plugins.buildPlugins();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    const registered = plugins[0].data.registered!;
    expect(Object.keys(registered.nodeTypes!)).toEqual(['sparkle', 'poster']);
    expect(registered.nodeTypes!.poster).toEqual({ description: 'A picture on a stand.', src: 'image', params: {} });
    expect(registered.passes).toEqual({ scan: { description: 'Scan lines.', params: { lines: { kind: 'number', default: 200, min: 10, max: 800, description: 'How many.' } } } });
    expect(registered.components).toEqual({});
    // A fresh guard (no registry: the reader before the plugin loads) checks the recorded node type's parameters
    const { assertGameConfiguration } = await import('../../shared/guards/game-config');
    const { unregisterNodeTypeSpec } = await import('../../shared/types/node-types');
    ['sparkle', 'poster'].forEach(unregisterNodeTypeSpec);
    const configuration = (entity: Record<string, unknown>) => ({
      version: { version: '0', timestamp: 't', schema: '2.14' },
      book: { id: 'b', title: 'B', author: 'A' },
      initialSpreadId: 'a',
      spreads: [{ id: 'a', title: 'A', firstPage: 1, lastPage: 2 }],
      entries: [],
      entities: { e: { assets: [], ...entity } },
      tutorial: [],
      plugins: [plugins[0].data],
    });
    expect(() => assertGameConfiguration(configuration({ type: 'sparkle', params: { count: 10 } }))).not.toThrow();
    expect(() => assertGameConfiguration(configuration({ type: 'sparkle', params: { count: 9999 } }))).toThrow(/entities\.e\.params\.count: expected a number from 1 to 500/);
    expect(() => assertGameConfiguration(configuration({ type: 'sparkel' }))).toThrow(/"sparkel" is not a node type – neither built in .* nor registered by a plugin of the book \(sparkle, poster\)/);
  }, 30000);

  it('a spread and the book name a plugin\'s pass (schema 2.21, #216): its parameters checked against the recorded spec', async () => {
    const withPass = NODES.replace('};\n', '  api.registerPass("scanLines", { description: "Scan lines.", params: { lines: { kind: "number", default: 200, min: 10, max: 800, description: "How many." } } }, () => ({}) as never);\n};\n');
    const files = (spreadPasses: string, bookPasses = '') => ({
      ...nodeContent('    type: group\n', withPass),
      'book.yaml': BOOK + bookPasses,
      'spreads/a/spread.yaml': spread(1, 2) + spreadPasses,
    });
    const build = await loadBuild(makeContent(files('passes:\n  - type: vignette\n  - type: scanLines\n    lines: 400\n', 'passes:\n  - type: scanLines\n')));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugins = await build.plugins.buildPlugins();
    const { book, spreads } = build.buildAll(plugins.map(p => p.data));
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(spreads[0].passes).toEqual([{ type: 'vignette' }, { type: 'scanLines', lines: 400 }]);
    expect(book.passes).toEqual([{ type: 'scanLines' }]);

    const wrong = await loadBuild(makeContent(files('passes:\n  - type: scanLines\n    lines: 2\n  - type: scanLine\n')));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const declared = await wrong.plugins.buildPlugins();
    wrong.buildAll(declared.map(p => p.data));
    vi.restoreAllMocks();
    expect(wrong.errors).toEqual([
      'spreads/a: passes[0].lines: expected a number from 10 to 800, got 2',
      'spreads/a: passes[1].type: "scanLine" is not one of bloom, vignette, grade or a pass of the book\'s plugins (scanLines)',
    ]);
  }, 60000);

  it('refuses a plugin pass with a built-in pass\'s name', async () => {
    const bloom = NODES.replace('};\n', '  api.registerPass("bloom", { description: "Mine.", params: {} }, () => ({}) as never);\n};\n');
    const build = await loadBuild(makeContent(nodeContent('    type: group\n', bloom)));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugins = await build.plugins.buildPlugins();
    vi.restoreAllMocks();
    expect(build.errors).toEqual(['plugins/nodes: the pass "bloom" is a built-in pass']);
    expect(plugins[0].data.registered?.passes).toEqual({});
  }, 30000);

  it('refuses an unknown parameter, a wrong value, a missing or wrong file, a file on a fileless type', async () => {
    const build = await loadBuild(makeContent(nodeContent([
      '    type: group',
      '    children:',
      '      - type: sparkle',
      '        params: { count: 999, glow: 1 }',
      '      - type: sparkle',
      '        src: p.jpg',
      '      - type: poster',
      '      - type: poster',
      '        src: v.mp4',
      '',
    ].join('\n'))));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await build.plugins.buildPlugins();
    build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([
      'entries/first target children[0]: params.count: expected a number from 1 to 500, got 999',
      'entries/first target children[0]: params.glow: unknown parameter of sparkle (position, rotation, scale, count, color)',
      'entries/first target children[1]: node type "sparkle" takes no file (its plugin\'s spec has no src)',
      'entries/first target children[2]: node type "poster" needs a src',
      'entries/first target children[3]: node type "poster" takes image files, not "video"',
    ]);
  }, 30000);

  it('a node type no plugin registers is an error; so are a bad spec and a type two plugins register', async () => {
    const none = await loadBuild(makeContent(nodeContent('    type: sparkle\n', TINT)));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await none.plugins.buildPlugins();
    none.buildAll();
    vi.restoreAllMocks();
    expect(none.errors).toEqual(['entries/first target: node type "sparkle" must be one of group, model, video, image, text, light']);

    const bad = await loadBuild(makeContent({
      ...nodeContent('    type: group\n'),
      // The poster renamed to a built-in type, a src kind that does not exist, a parameter named like the placement
      'plugins/nodes/index.ts': NODES
        .replace('src: "image", params: {}', 'src: "audio" as never, params: { position: { kind: "number", default: 0, min: 0, max: 1, description: "x" } }')
        .replace('"poster"', '"model"'),
      // The sparkle again (the nodes plugin registered it first)
      'plugins/other/index.ts': NODES.replace('"poster"', '"stand"'),
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await bad.plugins.buildPlugins();
    vi.restoreAllMocks();
    expect(bad.errors).toEqual([
      'plugins/nodes: "model" is a built-in node type',
      'plugins/nodes: model: src must be one of none, glb, video, image',
      'plugins/nodes: model.position: the placement\'s name – a node type\'s parameter needs another',
      'plugins/other: the node type "sparkle" is registered by the plugin nodes too',
    ]);
  }, 60000);
});

/** A plugin that makes a feedback buffer in register (API 1.6): the recording run hands out a dummy */
const FEEDBACK = `import type { PluginApi } from "osct-plugin-api";
export const register = (api: PluginApi): void => {
  const fragment = api.shadertoy("void mainImage(out vec4 c, in vec2 p) { c = texture(iChannel0, p / iResolution.xy); }");
  const fluid = api.feedback({ width: 64, height: 32, fragment, type: "float" });
  if (!fluid.texture || fluid.uniform.value !== fluid.texture || fluid.width !== 64 || fluid.frame !== 0) throw new Error("not a handle");
  fluid.reset();
  fluid.dispose();
  api.registerNodeType("painting", { description: "A painting.", params: {} }, ({ three }) => ({ object: new three.Group() }));
};
`;

describe('a plugin\'s feedback buffers (API 1.6)', () => {
  it('the recording run checks the options, hands out a dummy handle and records the plugin as any', async () => {
    const build = await loadBuild(makeContent(nodeContent('    type: painting\n', FEEDBACK)));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugins = await build.plugins.buildPlugins();
    build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(plugins[0].data).toMatchObject({ api: '1.6', registered: { nodeTypes: { painting: { description: 'A painting.', params: {} } } } });
    // Nothing of the buffer is recorded: it is no registration
    expect(Object.keys(plugins[0].data.registered ?? {})).toEqual(['components', 'nodeTypes', 'passes']);

    const main = await loadBuild(makeContent(nodeContent('    type: group\n', FEEDBACK.replace('"void mainImage', '"void main() {} void mainImage'))));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await main.plugins.buildPlugins();
    vi.restoreAllMocks();
    expect(main.errors).toEqual(['plugins/nodes: register failed – a Shadertoy pass has no main() of its own – the adapter adds it']);

    const size = await loadBuild(makeContent(nodeContent('    type: group\n', FEEDBACK.replace('width: 64', 'width: 0').replace(' || fluid.width !== 64', ''))));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await size.plugins.buildPlugins();
    vi.restoreAllMocks();
    expect(size.errors).toEqual(['plugins/nodes: api.feedback – width is a whole number of pixels, 1–2048']);
  }, 60000);
});
