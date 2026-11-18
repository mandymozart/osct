import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, entry, loadBuild, makeContent, scene, tempDir } from './helpers';
import { optimizeMedia, textureSetFiles } from '../src/lib/optimize-media';

afterEach(() => vi.unstubAllEnvs());

/** An entry whose model brings a texture set (#260, content schema 2.27) */
const content = (textures: string, files: Record<string, string> = {}) => ({
  'book.yaml': BOOK,
  'scenes/a/scene.yaml': scene('1–2'),
  'entries/first/entry.yaml': entry('a', 'x.jpg', `  entity:\n    type: model\n    src: face_mesh.glb\n${textures}`),
  'entries/first/x.jpg': 'image x',
  'entries/first/face_mesh.glb': 'glb',
  ...files,
});
const maps = { 'entries/first/face_512.jpg': 'jpg', 'entries/first/face_2048.jpg': 'jpg' };
const assetOf = (entries: readonly { target?: { entity?: unknown } }[]) =>
  (entries[0].target!.entity as { assets: { textures?: unknown }[] }).assets[0];

describe("a model's texture set in the content build (#260)", () => {
  it('one map: sizes and their files, smallest first, as content URLs', async () => {
    const build = await loadBuild(makeContent(content('    textures:\n      2048: face_2048.jpg\n      512: face_512.jpg\n', maps)));
    const { entries } = build.buildAll();
    expect(build.errors).toEqual([]);
    expect(assetOf(entries).textures).toEqual([{ sizes: [
      { size: 512, src: '/assets/content/entries/first/face_512.jpg' },
      { size: 2048, src: '/assets/content/entries/first/face_2048.jpg' },
    ] }]);
  });

  it('a map per material: a list of { material, sizes }', async () => {
    const build = await loadBuild(makeContent(content(
      '    textures:\n      - material: LOW_left\n        sizes:\n          512: face_512.jpg\n      - material: LOW_right\n        sizes:\n          2048: face_2048.jpg\n', maps)));
    const { entries } = build.buildAll();
    expect(build.errors).toEqual([]);
    expect(assetOf(entries).textures).toEqual([
      { material: 'LOW_left', sizes: [{ size: 512, src: '/assets/content/entries/first/face_512.jpg' }] },
      { material: 'LOW_right', sizes: [{ size: 2048, src: '/assets/content/entries/first/face_2048.jpg' }] },
    ]);
  });

  it('a model without textures builds as before', async () => {
    const build = await loadBuild(makeContent(content('')));
    const { entries } = build.buildAll();
    expect(build.errors).toEqual([]);
    expect(assetOf(entries)).not.toHaveProperty('textures');
  });

  it('reports a missing file and a size that is not one of the four', async () => {
    const build = await loadBuild(makeContent(content('    textures:\n      512: face_512.jpg\n      800: face_800.jpg\n', maps)));
    build.buildAll();
    expect(build.errors).toEqual([
      'entries/first target: file "face_800.jpg" not found in content/entries/first/',
      'entries/first target: textures[0].sizes[1].size: 800 is not one of 512, 1024, 2048, 4096',
    ]);
  });

  it('the files of the sets stay as authored in the client copy: the image shrinking leaves them out', async () => {
    const config = { entries: [{ target: { entity: { assets: [{ textures: [{ sizes: [{ size: 2048, src: '/assets/content/entries/first/face_2048.jpg' }] }] }], children: [] } } }] };
    const keep = textureSetFiles(config);
    expect([...keep]).toEqual(['entries/first/face_2048.jpg']);

    const dir = tempDir('osct-textures-');
    fs.mkdirSync(path.join(dir, 'entries/first'), { recursive: true });
    const file = path.join(dir, 'entries/first/face_2048.jpg');
    fs.writeFileSync(file, 'not a real jpeg – shrinking it would throw');
    expect(await optimizeMedia(dir, keep)).toEqual([]);
    expect(fs.readFileSync(file, 'utf8')).toBe('not a real jpeg – shrinking it would throw');
  });
});
