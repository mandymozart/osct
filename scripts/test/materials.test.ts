import { Box3, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, entry, loadBuild, makeContent, spread } from './helpers';
import { assertGameConfiguration } from '../../shared/guards/game-config';
import { gltfBounds, readGltfJson, zeroPlaneFindings } from '../src/build/zero-plane';
import type { EntityData } from '../../shared/types/game-config';

afterEach(() => vi.unstubAllEnvs());

const WATER = `import type { PluginApi } from "osct-plugin-api";
export const register = (api: PluginApi): void => {
  api.registerTexture("caustics", {
    description: "Light.",
    params: { cells: { kind: "number", default: 3, min: 1, max: 8, step: 1, description: "Cells." } },
  }, ({ params, three }) => new three.DataTexture(new Uint8Array(4 * Number(params.cells)), Number(params.cells), 1));
  api.registerMaterial("water", {
    description: "Water.",
    params: {
      deep: { kind: "color", default: "#0b4f6c", description: "Deep." },
      ripples: { kind: "texture", default: "", description: "Ripples." },
    },
  }, ({ params, time, three }) => new three.ShaderMaterial({ uniforms: { time, ripples: { value: params.ripples } } }));
};
`;

const model = (material: string) => entry(1, 'x.jpg', `  entity:\n    type: model\n    src: m.glb\n${material}`);

const content = (material: string, plugin = WATER) => ({
  'book.yaml': BOOK,
  'spreads/a/spread.yaml': spread(1, 2),
  'entries/first/entry.yaml': model(material),
  'entries/first/x.jpg': 'image x',
  'entries/first/m.glb': 'model',
  'entries/first/sand.jpg': 'image sand',
  'plugins/water/index.ts': plugin,
});

const build = async (material: string, plugin?: string) => {
  const loaded = await loadBuild(makeContent(content(material, plugin)));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const plugins = await loaded.plugins.buildPlugins();
  const result = loaded.buildAll();
  vi.restoreAllMocks();
  return { ...loaded, plugins, ...result };
};

describe('a plugin\'s materials and textures (#188)', () => {
  it('records them; a node\'s material passes with its values, a texture file next to the node becomes its content path', async () => {
    const { errors, plugins, entries } = await build('    material:\n      type: water\n      params:\n        deep: "#002233"\n        ripples: sand.jpg\n');
    expect(errors).toEqual([]);
    expect(plugins[0].data.registered?.materials?.water.params.ripples).toEqual({ kind: 'texture', default: '', description: 'Ripples.' });
    expect(Object.keys(plugins[0].data.registered?.textures ?? {})).toEqual(['caustics']);
    expect(entries[0].target?.entity).toMatchObject({ material: { type: 'water', params: { deep: '#002233', ripples: '/assets/content/entries/first/sand.jpg' } } });
  }, 30000);

  it('takes a procedural texture by its type, with or without values of its own', async () => {
    const { errors, entries } = await build('    material:\n      type: water\n      params:\n        ripples:\n          type: caustics\n          cells: 5\n');
    expect(errors).toEqual([]);
    expect(entries[0].target?.entity).toMatchObject({ material: { params: { ripples: { type: 'caustics', cells: 5 } } } });
    expect((await build('    material:\n      type: water\n      params:\n        ripples: caustics\n')).errors).toEqual([]);
  }, 30000);

  it('refuses a material no plugin registers, a wrong value, a texture nobody registers, a texture that is no picture', async () => {
    expect((await build('    material:\n      type: lava\n')).errors).toEqual([expect.stringMatching(/material\.type: "lava" is not a material of the book's plugins \(water\)/)]);
    expect((await build('    material:\n      type: water\n      params:\n        deep: blue\n        glow: 1\n')).errors).toEqual([
      expect.stringMatching(/material\.params\.deep: expected a color/),
      expect.stringMatching(/material\.params\.glow: unknown parameter of water/),
    ]);
    expect((await build('    material:\n      type: water\n      params:\n        ripples: sparkles\n')).errors).toEqual([expect.stringMatching(/material\.ripples: "sparkles" is no texture a plugin of the book registers/)]);
    expect((await build('    material:\n      type: water\n      params:\n        ripples:\n          type: caustics\n          cells: 99\n')).errors).toEqual([expect.stringMatching(/ripples\.cells: expected a number from 1 to 8/)]);
    expect((await build('    material:\n      type: water\n      params:\n        ripples: m.glb\n')).errors).toEqual([expect.stringMatching(/a texture is an image or a video, not "m\.glb"/)]);
  }, 60000);

  it('refuses a texture spec whose parameter is a texture, and a material without a build', async () => {
    const bad = WATER
      .replace('cells: { kind: "number", default: 3, min: 1, max: 8, step: 1, description: "Cells." }', 'inner: { kind: "texture", default: "", description: "No." }')
      .replace('}, ({ params, time, three }) => new three.ShaderMaterial({ uniforms: { time, ripples: { value: params.ripples } } }));', '}, undefined as never);');
    const { errors } = await build('', bad);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/caustics\.inner: a procedural texture's parameter cannot be a texture/),
      expect.stringMatching(/the material water needs a build\(context\) function/),
    ]));
  }, 30000);

  it('the shared guard checks a node\'s material against the recorded specs, and refuses one without plugins', () => {
    const config = (material: unknown, plugins?: unknown) => ({
      version: { version: '0.0.0', timestamp: 't', schema: '2.17' },
      book: { id: 'b', title: 'B', author: 'A' },
      initialSpreadId: 's',
      spreads: [{ id: 's', title: 'S', firstPage: 1, lastPage: 2 }],
      entries: [],
      entities: { tank: { type: 'group', assets: [], material } },
      tutorial: [],
      ...(plugins ? { plugins } : {}),
    });
    const recorded = [{ id: 'water', src: '/p.js', api: '1.4', registered: { materials: { water: { description: 'W.', params: { deep: { kind: 'color', default: '#000000', description: 'D.' } } } } } }];
    expect(() => assertGameConfiguration(config({ type: 'water', params: { deep: '#123456' } }, recorded))).not.toThrow();
    expect(() => assertGameConfiguration(config({ type: 'water', params: { deep: 3 } }, recorded))).toThrow(/entities\.tank\.material\.params\.deep: expected a color/);
    expect(() => assertGameConfiguration(config({ type: 'lava' }, recorded))).toThrow(/"lava" is not a material/);
    expect(() => assertGameConfiguration(config({ type: 'water' }))).toThrow(/the book's plugins register none/);
  });
});

describe('the zero plane (#189)', () => {
  const standing = (box: Box3) => () => box;
  const node = (params: Record<string, unknown>, extra: Partial<EntityData> = {}): EntityData => ({
    type: 'model', assets: [{ id: 'm', assetType: 'glb', src: '/assets/content/entries/a/m.glb' }], params, ...extra,
  });

  it('a model whose floor is its origin stands on the page as placed by default', () => {
    expect(zeroPlaneFindings(node({}), 'entries/a', standing(new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5))))).toEqual([]);
  });

  it('a model whose pivot is its middle sinks; the finding names the position that stands it on the page', () => {
    const middle = standing(new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)));
    // Default: rotation [90, 0, 0] (y → out of the page), scale 0.5 → the lowest point at −0.25
    expect(zeroPlaneFindings(node({}), 'entries/a', middle)).toEqual([{ label: 'entries/a', lowest: -0.25, position: [0, 0, 0.25] }]);
    // Floating, inside a group scaled by 2: the position is in the group's units
    const group: EntityData = { type: 'group', assets: [], params: { scale: 2 }, children: [node({ position: [0, 0, 0.5] })] };
    expect(zeroPlaneFindings(group, 'entries/a', middle)).toEqual([{ label: 'entries/a children[0]', lowest: 0.5, position: [0, 0, 0.25] }]);
    // The fix is right: placed there, nothing is found
    expect(zeroPlaneFindings({ ...group, children: [node({ position: [0, 0, 0.25] })] }, 'entries/a', middle)).toEqual([]);
  });

  it('reads a glTF\'s bounds through its node transforms', () => {
    const json = {
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
      nodes: [{ translation: [0, 2, 0], children: [1] }, { mesh: 0, scale: [2, 2, 2] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ min: [-1, -1, -1], max: [1, 1, 1] }],
    };
    const text = Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' '));
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + text.length, 8);
    header.writeUInt32LE(text.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    const box = gltfBounds(readGltfJson(Buffer.concat([header, text]))!)!;
    expect(box.min.toArray()).toEqual([-2, 0, -2]);
    expect(box.max.toArray()).toEqual([2, 4, 2]);
  });

  it('a .glb whose JSON chunk is broken reads as no glTF, it does not throw', () => {
    const text = Buffer.from('{"asset": ');
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + text.length, 8);
    header.writeUInt32LE(text.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    expect(readGltfJson(Buffer.concat([header, text]))).toBeNull();
    expect(readGltfJson(Buffer.from('not json'))).toBeNull();
  });
});
