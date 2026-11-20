import { describe, expect, it } from 'vitest';
import { EXPERIENCE, loadBuild, makeContent, scene } from './helpers';
import { textureSetFiles } from '../src/lib/optimize-media';

/** An entry with a picture and an AR video node (#331, content schema 4.3) */
const content = (entryExtra: string, node: string, files: Record<string, string> = {}) => ({
  'experience.yaml': EXPERIENCE,
  'scenes/a/scene.yaml': scene('1–2'),
  'entries/first/entry.yaml': `category: glossary\ntitle: First\nscene: a\nimage: pic.webp\n${entryExtra}target:\n  image: x.jpg\n  entity:\n    type: video\n    src: film.mp4\n${node}`,
  'entries/first/x.jpg': 'image x',
  'entries/first/pic.webp': 'webp',
  'entries/first/film.mp4': 'mp4',
  ...files,
});
const files = { 'entries/first/film_480.mp4': 'mp4', 'entries/first/film_1080.mp4': 'mp4', 'entries/first/pic_512.webp': 'webp' };
const url = (file: string) => `/assets/content/entries/first/${file}`;

describe('media levels in the content build (#331)', () => {
  it('a video node and an entry picture: levels and their files, smallest first, as content URLs', async () => {
    const build = await loadBuild(makeContent(content('imageLevels:\n  512: pic_512.webp\n', '    levels:\n      1080: film_1080.mp4\n      480: film_480.mp4\n', files)));
    const { entries } = build.buildAll();
    expect(build.errors).toEqual([]);
    const [first] = entries as unknown as { imageLevels?: unknown; target: { entity: { assets: { levels?: unknown }[] } } }[];
    expect(first.imageLevels).toEqual([{ level: 512, src: url('pic_512.webp') }]);
    expect(first.target.entity.assets[0].levels).toEqual([{ level: 480, src: url('film_480.mp4') }, { level: 1080, src: url('film_1080.mp4') }]);
  });

  it('reports a level that is not one of the kind and a missing file', async () => {
    const build = await loadBuild(makeContent(content('', '    levels:\n      600: film_600.mp4\n', files)));
    build.buildAll();
    expect(build.errors).toEqual([
      'entries/first target: file "film_600.mp4" not found in content/entries/first/',
      'entries/first target: levels[0].level: 600 is not one of 480, 720, 1080 (video, p)',
    ]);
  });

  it('the level files stay as authored in the client copy', () => {
    const config = { entries: [{ imageLevels: [{ level: 512, src: url('pic_512.webp') }], target: { entity: { assets: [{ levels: [{ level: 480, src: url('film_480.mp4') }] }] } } }] };
    expect([...textureSetFiles(config)].sort()).toEqual(['entries/first/film_480.mp4', 'entries/first/pic_512.webp']);
  });
});
