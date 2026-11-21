import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXPERIENCE, entry, loadBuild, makeContent, scene } from './helpers';

afterEach(() => vi.unstubAllEnvs());

const valid = () => ({
  'experience.yaml': EXPERIENCE,
  'scenes/a/scene.yaml': scene('1–2'),
  'entries/second/entry.yaml': entry('a', 'y.jpg').replace('title: Entry a', 'title: Second'),
  'entries/second/y.jpg': 'image y',
  'entries/first/entry.yaml': entry('a', 'x.jpg').replace('title: Entry a', 'title: First'),
  'entries/first/x.jpg': 'image x',
});

describe('content build', () => {
  it('builds valid content without errors', async () => {
    const build = await loadBuild(makeContent(valid()));
    const { experience, scenes, entries } = build.buildAll();
    expect(build.errors).toEqual([]);
    expect(experience).toEqual({ id: 'test', title: 'Test Experience', book: { author: 'Someone' } });
    expect(scenes).toEqual([{ id: 'a', label: '1–2', surfaces: [{ id: 'surface', widthMm: 460, heightMm: 320, place: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } }] }]);
    expect(entries.find(e => e.id === 'first')).toMatchObject({ scene: 'a', title: 'First' });
    expect(entries.find(e => e.id === 'first')).not.toHaveProperty('page');
    expect(entries.find(e => e.id === 'first')?.target?.imageSrc).toBe('/assets/content/entries/first/x.jpg');
  });

  it('orders scenes by order, then id', async () => {
    const build = await loadBuild(makeContent({
      ...valid(),
      'scenes/b/scene.yaml': scene('Cover', -1),
    }));
    expect(build.scenes.buildScenes().map(s => s.id)).toEqual(['b', 'a']);
  });

  it('places surfaces without a place in a row centred on the origin; a place\'s rotations default to 0', async () => {
    const build = await loadBuild(makeContent({
      ...valid(),
      'scenes/a/scene.yaml': 'label: Room\nsurfaces:\n  - { id: a, widthMm: 100, heightMm: 50 }\n  - { id: b, widthMm: 300, heightMm: 50 }\n',
      'scenes/w/scene.yaml': 'label: Wall\norder: 1\nsurfaces:\n  - { id: wall, widthMm: 2000, heightMm: 1500, place: { x: 0, y: 750, z: -500, rx: 90 } }\n',
      'entries/first/entry.yaml': entry('a', 'x.jpg', '  place: { surface: b, x: 10, y: 20, width: 30 }\n'),
      'entries/second/entry.yaml': entry('w', 'y.jpg', '  place: { x: 1, y: 2, width: 3, height: 4 }\n'),
    }));
    const { scenes, entries } = build.buildAll();
    expect(build.errors).toEqual([]);
    expect(scenes[0].surfaces.map(s => s.place)).toEqual([{ x: -150, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, { x: 50, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }]);
    expect(scenes[1].surfaces[0].place).toEqual({ x: 0, y: 750, z: -500, rx: 90, ry: 0, rz: 0 });
    expect(entries.find(e => e.id === 'first')?.target?.place).toEqual({ surface: 'b', x: 10, y: 20, width: 30 });
    expect(entries.find(e => e.id === 'second')?.target?.place).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  // The world and the sky as assets: paths below the content folder become content paths
  describe('environment assets', () => {
    const withEnvironment = (environment: string, files: Record<string, string> = {}) => ({
      ...valid(),
      'experience.yaml': `${EXPERIENCE}environment:
${environment}`,
      ...files,
    });

    it('resolves the world model and the sky below the content folder', async () => {
      const build = await loadBuild(makeContent(withEnvironment(
        '  world: cafe\n  onionSky: true\n  worldSrc: environment/world.glb\n  skySrc: /assets/content/environment/sky.jpg\n',
        { 'environment/world.glb': 'glb', 'environment/sky.jpg': 'jpg' },
      )));
      const { experience } = build.buildAll();
      expect(build.errors).toEqual([]);
      expect(experience.environment).toEqual({ world: 'cafe', onionSky: true, worldSrc: '/assets/content/environment/world.glb', skySrc: '/assets/content/environment/sky.jpg' });
    });

    it('keeps an absolute URL (an uploaded asset)', async () => {
      const build = await loadBuild(makeContent(withEnvironment('  world: cafe\n  onionSky: false\n  skySrc: https://cdn.example.com/assets/b/a/v1.webp\n')));
      const { experience } = build.buildAll();
      expect(build.errors).toEqual([]);
      expect(experience.environment?.skySrc).toBe('https://cdn.example.com/assets/b/a/v1.webp');
    });

    it('reports a missing file, a wrong type and a path out of the folder', async () => {
      const build = await loadBuild(makeContent(withEnvironment(
        '  world: cafe\n  onionSky: true\n  worldSrc: environment/sky.jpg\n  skySrc: ../sky.jpg\n',
        { 'environment/sky.jpg': 'jpg' },
      )));
      vi.spyOn(console, 'log').mockImplementation(() => {});
      build.buildAll();
      vi.restoreAllMocks();
      expect(build.errors).toEqual(['experience.yaml: environment.skySrc: file "../sky.jpg" not found in the content folder']);
      const typed = await loadBuild(makeContent(withEnvironment('  world: cafe\n  onionSky: true\n  worldSrc: environment/sky.jpg\n', { 'environment/sky.jpg': 'jpg' })));
      typed.buildAll();
      expect(typed.errors).toEqual(['experience.yaml: environment.worldSrc must be a glTF model (.glb, .gltf).']);
    });
  });

  describe('errors', () => {
    const errorsFor = async (files: Record<string, string>) => {
      const build = await loadBuild(makeContent(files));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      build.buildAll();
      vi.restoreAllMocks();
      return build.errors;
    };

    it('a scene without surfaces', async () => {
      expect(await errorsFor({ ...valid(), 'scenes/b/scene.yaml': 'label: B\nsurfaces: []\n' }))
        .toContainEqual('scenes/b: a scene needs at least one surface');
    });

    it('an entry of a scene that does not exist, or on a surface its scene does not have', async () => {
      const errors = await errorsFor({ ...valid(), 'entries/lost/entry.yaml': entry('nowhere'), 'entries/off/entry.yaml': entry('a', undefined, 'surface: wall\n') });
      expect(errors).toContainEqual('entries/lost: scene "nowhere" is not in scenes/');
      expect(errors).toContainEqual('entries/off: scene "a" has no surface "wall"');
    });

    it('a target\'s place without its surface in a scene of several', async () => {
      const files = {
        ...valid(),
        'scenes/a/scene.yaml': 'label: A\nsurfaces:\n  - { id: l, widthMm: 230, heightMm: 320 }\n  - { id: r, widthMm: 230, heightMm: 320 }\n',
        'entries/first/entry.yaml': entry('a', 'x.jpg', '  place: { x: 1, y: 2, width: 3 }\n'),
      };
      expect(await errorsFor(files)).toContainEqual('entries/first target: scene "a" has several surfaces – place needs the surface it lies on');
    });

    it('more than 10 targets on a scene', async () => {
      const files: Record<string, string> = { ...valid() };
      for (let i = 0; i < 9; i++) {
        files[`entries/extra${i}/entry.yaml`] = entry('a', 'z.jpg');
        files[`entries/extra${i}/z.jpg`] = `z${i}`;
      }
      expect(await errorsFor(files)).toContainEqual('scenes/a has 11 targets, max is 10.');
    });

    it('targets switched off do not count towards the 10 (#249)', async () => {
      const files: Record<string, string> = { ...valid() };
      for (let i = 0; i < 9; i++) {
        files[`entries/extra${i}/entry.yaml`] = entry('a', 'z.jpg', '  enabled: false\n');
        files[`entries/extra${i}/z.jpg`] = `z${i}`;
      }
      expect(await errorsFor(files)).not.toContainEqual('scenes/a has 11 targets, max is 10.');
    });

    it('a target enabled other than true or false', async () => {
      expect((await errorsFor({ ...valid(), 'entries/first/entry.yaml': entry('a', 'x.jpg', '  enabled: maybe\n') })).join('\n')).toMatch(/enabled/);
    });

    it('a missing file', async () => {
      const { 'entries/first/x.jpg': _, ...files } = valid();
      expect(await errorsFor(files)).toContainEqual('entries/first target: file "x.jpg" not found in content/entries/first/');
    });

    it('a missing entry video is a warning: the target is built without its AR video', async () => {
      const videoEntity = ['  entity:', '    type: video', '    src: video.mp4', ''].join('\n');
      const files = { ...valid(), 'entries/first/entry.yaml': entry('a', 'x.jpg', videoEntity) };
      const build = await loadBuild(makeContent(files));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const { entries } = build.buildAll();
      vi.restoreAllMocks();
      expect(build.errors).toEqual([]);
      expect(build.warnings).toContainEqual('entries/first target: video "video.mp4" is not on this machine (videos are not in git) – built without its AR video');
      expect(entries.find(e => e.id === 'first')?.target?.entity).toBeUndefined();
    });

    it('an unknown category', async () => {
      const errors = await errorsFor({ ...valid(), 'entries/first/entry.yaml': entry('a', 'x.jpg').replace('glossary', 'poem') });
      expect(errors.join('\n')).toMatch(/entries\/first: .*category.*must be one of/);
    });

    it('an entity reference that does not exist', async () => {
      const errors = await errorsFor({ ...valid(), 'entries/first/entry.yaml': `${entry('a', 'x.jpg')}  entity:\n    ref: nothing\n` });
      expect(errors).toContainEqual('entries/first target: entity ref "nothing" not found in content/entities/');
    });

    it('a list beyond the phone budget is a warning (#86)', async () => {
      const build = await loadBuild(makeContent({
        'experience.yaml': EXPERIENCE,
        'scenes/a/scene.yaml': scene('1–2') + 'passes:\n  - type: bloom\n  - type: bloom\n  - type: vignette\n  - type: grade\n',
      }));
      build.buildAll();
      expect(build.errors).toEqual([]);
      expect(build.warnings).toEqual(['scenes/a: 4 passes (the phone budget is 3) and 2 blooms (one fits) – every pass is a full-screen render on the phone']);
    });

    it('passes of a scene and the experience are checked against their specs', async () => {
      const { content } = makeContent({
        'experience.yaml': EXPERIENCE + 'passes:\n  - type: vignette\n    strength: 0.3\n',
        'scenes/a/scene.yaml': scene('1–2') + 'passes:\n  - type: bloom\n    strength: 0.8\n',
        'scenes/b/scene.yaml': scene('3–4', 1) + 'passes:\n  - type: glow\n  - type: bloom\n    radius: 7\n',
      });
      const build = await loadBuild({ content });
      const { experience, scenes } = build.buildAll();
      expect(experience.passes).toEqual([{ type: 'vignette', strength: 0.3 }]);
      expect(scenes.find(s => s.id === 'a')?.passes).toEqual([{ type: 'bloom', strength: 0.8 }]);
      expect(build.errors).toEqual([
        'scenes/b: passes[0].type: "glow" is not one of bloom, vignette, grade',
        'scenes/b: passes[1].radius: expected a number from 0 to 1, got 7',
      ]);
    });

    it('a pass that is off is kept with its values and not counted in the phone budget (#233)', async () => {
      const build = await loadBuild(makeContent({
        'experience.yaml': EXPERIENCE + 'passes:\n  - type: bloom\n    enabled: false\n    strength: 0.35\n  - type: bloom\n  - type: vignette\n  - type: grade\n',
        'scenes/a/scene.yaml': scene('1–2') + 'passes:\n  - type: vignette\n    enabled: off\n',
      }));
      const { experience } = build.buildAll();
      expect(experience.passes?.[0]).toEqual({ type: 'bloom', enabled: false, strength: 0.35 });
      expect(build.warnings).toEqual([]);
      expect(build.errors).toEqual(['scenes/a: passes[0].enabled: expected true or false, got "off"']);
    });

    it('the printed book: author and publisher under book:, passed on; a book needs its author (#320)', async () => {
      const printed = await loadBuild(makeContent({ ...valid(), 'experience.yaml': `${EXPERIENCE}  publisher: P\n` }));
      expect(printed.buildAll().experience.book).toEqual({ author: 'Someone', publisher: 'P' });
      expect(printed.errors).toEqual([]);
      expect(await errorsFor({ ...valid(), 'experience.yaml': 'id: test\ntitle: T\nbook:\n  publisher: P\n' })).toEqual([expect.stringContaining('author')]);
    });

    it('sourceOfTruth is gone: on the top level or under book: an error (#320)', async () => {
      expect(await errorsFor({ ...valid(), 'experience.yaml': 'id: test\ntitle: T\nsourceOfTruth: digital\n' })).toContainEqual(expect.stringContaining('sourceOfTruth is gone'));
      expect(await errorsFor({ ...valid(), 'experience.yaml': `${EXPERIENCE}  sourceOfTruth: print\n` })).toContainEqual(expect.stringContaining('book.sourceOfTruth is gone'));
    });

    it('an experience without a printed book (#320)', async () => {
      const build = await loadBuild(makeContent({ ...valid(), 'experience.yaml': 'id: wall\ntitle: A Wall\n' }));
      expect(build.buildAll().experience).toEqual({ id: 'wall', title: 'A Wall' });
      expect(build.errors).toEqual([]);
    });

    it('print data on the top level is an error – it belongs under book: (#320)', async () => {
      expect(await errorsFor({ ...valid(), 'experience.yaml': 'id: test\ntitle: T\nauthor: A\npublisher: P\n' })).toEqual(expect.arrayContaining([
        'experience.yaml: author belongs to the printed book – write it under book:',
        'experience.yaml: publisher belongs to the printed book – write it under book:',
      ]));
    });

    it('a missing experience.yaml; a book.yaml asks for the conversion', async () => {
      const { 'experience.yaml': _, ...files } = valid();
      expect(await errorsFor(files)).toContainEqual('experience.yaml is missing');
      expect(await errorsFor({ ...files, 'book.yaml': 'id: test\ntitle: T\nauthor: A\n' })).toContainEqual(expect.stringContaining('npm run convert:4'));
    });
  });

  describe('input hash', () => {
    it('ignores Windows line endings in text files, not content changes', async () => {
      const unix = await loadBuild(makeContent({ ...valid(), 'experience.yaml': EXPERIENCE }));
      const hashUnix = unix.hash.hashBuildInputs();
      const windows = await loadBuild(makeContent({ ...valid(), 'experience.yaml': EXPERIENCE.replace(/\n/g, '\r\n') }));
      expect(windows.hash.hashBuildInputs()).toBe(hashUnix);
      const changed = await loadBuild(makeContent({ ...valid(), 'experience.yaml': EXPERIENCE.replace('Test', 'Other') }));
      expect(changed.hash.hashBuildInputs()).not.toBe(hashUnix);
    });
  });
});

describe('the test fixture', () => {
  it('builds without errors', { timeout: 60000 }, async () => {
    const build = await loadBuild({ content: path.resolve(__dirname, '../../fixtures/content') });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // The fixture's plugin (tint) first: Studio B's standing video uses its layer
    const plugins = await build.plugins.buildPlugins();
    build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(plugins.map(p => p.data.id)).toEqual(['tint']);
  });
});

describe('the demo', () => {
  it('builds without errors: every node type, the covers, a shared entity, fourteen plugins (three with a node type, one with a material and a texture, two with a pass, one that takes a model file, two with looks)', { timeout: 60000 }, async () => {
    const build = await loadBuild({ content: path.resolve(__dirname, '../../fixtures/demo') });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugins = await build.plugins.buildPlugins();
    const { experience, scenes, entries } = build.buildAll(plugins.map(p => p.data));
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(experience.id).toBe('demo');
    // The demo is the staging database's export since #322 (decision (b)): "The Demo Book", with print data
    expect(experience.book?.author).toBe('OSCT');
    expect(plugins.map(p => p.data.id)).toEqual(['aquarium', 'contact-shadow', 'cutout-shadow', 'fluid', 'grain', 'hover', 'lifts', 'my-model-look', 'my-sparkle-look', 'narrative', 'paper', 'pulse', 'reveal', 'scanlines', 'scenes', 'sparkle', 'spin', 'tally', 'tint', 'toon']);
    // A plugin's pass (#216): the grain plugin's film grain on The twins, checked against its recorded spec
    expect(Object.keys(plugins.find(p => p.data.id === 'grain')!.data.registered!.passes ?? {})).toEqual(['filmGrain']);
    expect(scenes.find(s => s.id === 'the-twins')?.passes).toEqual([{ type: 'filmGrain', amount: 0.14 }]);
    // A second pass (#216, #233): the scanlines plugin's lines on The switch, switched off – there to be found and switched on
    const scanLines = plugins.find(p => p.data.id === 'scanlines')!.data.registered!.passes ?? {};
    expect(Object.keys(scanLines)).toEqual(['scanLines']);
    expect(Object.keys(scanLines.scanLines.params)).toEqual(['spacing', 'amount', 'speed', 'reach']);
    expect(scenes.find(s => s.id === 'the-switch')?.passes).toEqual([{ type: 'scanLines', enabled: false, spacing: 4 }]);
    expect(scenes.map(s => s.label)).toEqual(['Cover', '1–2', '3–4', '5–6', '7–8', '9–10', '11–12', 'Back cover', 'Cat Pope poster (SCUTOONS test)']);
    expect(scenes.map(s => s.surfaces[0].widthMm)).toEqual([230, 460, 460, 460, 460, 460, 460, 230, 297]);
    const types = new Set<string>();
    const walk = (node: { type: string; children?: Array<{ type: string }> }) => { types.add(node.type); (node.children ?? []).forEach(walk as never); };
    entries.forEach(e => { if (e.target?.entity && !('ref' in e.target.entity)) walk(e.target.entity); });
    expect([...types].sort()).toEqual(['aquarium', 'group', 'image', 'inkPainting', 'model', 'text', 'video']);
    expect(entries.some(e => e.target?.entity && 'ref' in e.target.entity)).toBe(true);
    expect(new Set(entries.map(e => e.category))).toEqual(new Set(['glossary', 'video', 'text', 'link']));
    // The shared entity carries the sparkle plugin's own node type, its parameters in params
    expect(build.entities.buildEntities().beacon.children?.find(c => c.type === 'sparkle')?.params).toMatchObject({ count: 120, color: '#ffe2a8' });
    // The aquarium (#188): a plugin's node type carrying a plugin's material, recorded with the procedural texture
    const aquarium = plugins.find(p => p.data.id === 'aquarium')!.data.registered!;
    expect([Object.keys(aquarium.nodeTypes ?? {}), Object.keys(aquarium.materials ?? {}), Object.keys(aquarium.textures ?? {})]).toEqual([['aquarium'], ['water'], ['caustics']]);
    const tank = entries.find(e => e.id === 'aquarium')?.target?.entity as { children?: Array<{ type: string; material?: unknown }> } | undefined;
    expect(tank?.children?.[0]).toMatchObject({ type: 'aquarium', material: { type: 'water' } });
    // The ink painting (#225): a node type whose picture is two feedback buffers – nothing of them recorded
    expect(plugins.find(p => p.data.id === 'fluid')!.data.registered).toEqual({
      components: {}, passes: {}, nodeTypes: { inkPainting: expect.objectContaining({ params: expect.objectContaining({ resolution: expect.objectContaining({ options: ['256', '512'] }) }) }) },
    });
    // The behaviour (#88): the key takes itself on a tap, the door's rules decide when the narrative plugin opens it
    const componentsOf = (id: string) => (entries.find(e => e.id === id)?.target?.entity as { components?: Array<{ type: string; rules?: unknown[] }> } | undefined)?.components ?? [];
    expect(componentsOf('key').find(c => c.type === 'behaviour')?.rules).toEqual([
      { on: 'keyRattled', do: [{ play: 'rattle' }, { set: { hasKey: true }, scope: 'experience' }, { emit: 'keyRattled' }] },
    ]);
    expect(componentsOf('door').map(c => c.type)).toEqual(['door', 'behaviour', 'reveal']);
    // The paper (#263): a component whose parameter is a model file – recorded as such, the file next to the node as its content path
    expect(plugins.find(p => p.data.id === 'paper')!.data.registered!.components?.paper.params.sheet).toMatchObject({ kind: 'model', default: '' });
    expect(componentsOf('screen').find(c => c.type === 'paper')).toEqual({ type: 'paper', sheet: '/assets/content/entries/screen/v1.glb' });
    // The reveal (#267): the engine's inflate-and-dissolve look as code – a plugin's look, recorded with its parameters for the experience's appearance
    const reveal = plugins.find(p => p.data.id === 'reveal')!.data.registered!.appearances ?? {};
    expect(Object.keys(reveal)).toEqual(['revealCode']);
    expect(Object.keys(plugins.find(p => p.data.id === 'lifts')!.data.registered!.appearances ?? {})).toEqual(['fadeCode', 'printLiftCode']);
    expect(reveal.revealCode.params).toMatchObject({ duration: { kind: 'number', default: 3470 }, spin: { default: -0.5 }, sparks: { default: 300 }, edgeColor: { kind: 'color' } });
    // Every model stands on its page (#189)
    const { contentModelBounds, zeroPlaneFindings } = await import('../src/build/zero-plane');
    const trees = [
      ...Object.entries(build.entities.buildEntities()).map(([ref, node]) => ({ label: `entities/${ref}`, node })),
      ...entries.flatMap(e => (e.target?.entity && !('ref' in e.target.entity) ? [{ label: `entries/${e.id}`, node: e.target.entity }] : [])),
    ];
    expect(trees.flatMap(({ node, label }) => zeroPlaneFindings(node, label, contentModelBounds))).toEqual([]);
  });
});

// A video's subtitle files are found by their names (#257): nothing in the YAML names them
describe('subtitles', () => {
  const VTT = 'WEBVTT\n\n00:01.000 --> 00:02.000\nHello\n';

  it('pairs the subtitle files beside a video with it, per language', async () => {
    const build = await loadBuild(makeContent({
      ...valid(),
      'entries/first/speak.mp4': 'video',
      'entries/first/speak.fr.vtt': VTT,
      'entries/first/speak.en.vtt': VTT,
    }));
    const { buildSubtitles } = await import('../src/build/subtitles');
    expect(buildSubtitles()).toEqual([{
      media: '/assets/content/entries/first/speak.mp4',
      tracks: { en: '/assets/content/entries/first/speak.en.vtt', fr: '/assets/content/entries/first/speak.fr.vtt' },
    }]);
    expect(build.errors).toEqual([]);
    expect(build.warnings).toEqual([]);
  });

  it('leaves out a subtitle file without its video or without a language, and refuses one that is no WebVTT', async () => {
    const build = await loadBuild(makeContent({
      ...valid(),
      'entries/first/speak.mp4': 'video',
      'entries/first/speak.en.vtt': 'Hello\n',
      'entries/first/other.en.vtt': VTT,
      'entries/second/speak.vtt': VTT,
    }));
    const { buildSubtitles } = await import('../src/build/subtitles');
    expect(buildSubtitles().map(s => Object.keys(s.tracks))).toEqual([['en']]);
    expect(build.errors).toEqual(['entries/first/speak.en.vtt: the first line must be "WEBVTT"', 'entries/first/speak.en.vtt: no cue found']);
    expect(build.warnings).toEqual([
      'entries/first/other.en.vtt: no video "other.mp4" (or .webm, .mov) beside it – the subtitles are left out',
      'entries/second/speak.vtt: a subtitle file is named <video name>.<language>.vtt (speak.en.vtt) – left out',
    ]);
  });
});
