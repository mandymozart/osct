import { describe, expect, it } from 'vitest';
import { ContentBuild, fileIndex, isInSync, planFromListing, videosMissingLocally } from '../src/lib/content-sync';
import { StoredFile } from '../src/lib/storage';

/**
 * The CDN sync mirrors the content build into one folder per environment: changed files are overwritten in
 * place, files that are no longer part of the content – and anything else in the folder, like old version
 * folders – are deleted. Planned from the storage listing, no storage zone needed.
 */
const build: ContentBuild = {
  hash: 'a'.repeat(64),
  schema: '1.0',
  version: '1.7.2',
  config: Buffer.from('{}'),
  configSha256: 'CONFIG',
  files: [
    { file: 'entries/one/image.jpg', size: 10, sha256: 'AAA111' },
    { file: 'entries/two/model.glb', size: 20, sha256: 'BBB222' },
    { file: 'entries/two/model.glb.gz', size: 5, sha256: 'CCC333' },
  ],
};

const file = (path: string, checksum: string | null = null, size = 1): StoredFile => ({ path, size, isDirectory: false, checksum });
const folder = (path: string): StoredFile => ({ path, size: 0, isDirectory: true, checksum: null });

describe('CDN sync plan', () => {
  it('uploads everything into an empty environment folder', () => {
    const plan = planFromListing('staging', build, [], null);
    expect(plan.upload.map(f => f.file)).toEqual(build.files.map(f => f.file));
    expect(plan.remove).toEqual([]);
    expect(plan.configChanged).toBe(true);
  });

  it('uploads only changed files and deletes what the content no longer has', () => {
    const remote = [
      file('staging/game.config.json', 'OLDCONFIG'),
      file('staging/files.json', 'X'),
      folder('staging/assets'),
      folder('staging/assets/content'),
      folder('staging/assets/content/entries'),
      folder('staging/assets/content/entries/one'),
      file('staging/assets/content/entries/one/image.jpg', 'AAA111'),
      file('staging/assets/content/entries/one/old.jpg', 'DDD'),
      folder('staging/assets/content/entries/two'),
      file('staging/assets/content/entries/two/model.glb', 'CHANGED'),
      folder('staging/assets/content/entries/gone'),
      file('staging/assets/content/entries/gone/video.mp4', 'EEE'),
      // from the versioned layout before 1.7.2
      file('staging/latest.json', 'F'),
      folder('staging/1.6.0-29a25c7416d2'),
      folder('staging/1.6.0-29a25c7416d2/assets'),
      file('staging/1.6.0-29a25c7416d2/game.config.json', 'G'),
    ];
    const plan = planFromListing('staging', build, remote, 'b'.repeat(64));
    expect(plan.upload.map(f => f.file)).toEqual(['entries/two/model.glb', 'entries/two/model.glb.gz']);
    expect(plan.unchanged).toBe(1);
    expect(plan.remove.sort()).toEqual([
      'staging/1.6.0-29a25c7416d2/',
      'staging/assets/content/entries/gone/',
      'staging/assets/content/entries/one/old.jpg',
      'staging/latest.json',
    ]);
    expect(plan.configChanged).toBe(true);
  });

  it('re-uploads a file the storage reports no checksum for, and everything with force', () => {
    const remote = build.files.map(f => file(`staging/assets/content/${f.file}`, f.sha256));
    remote[0] = file(remote[0].path, null);
    expect(planFromListing('staging', build, remote, null).upload.map(f => f.file)).toEqual(['entries/one/image.jpg']);
    expect(planFromListing('staging', build, remote, null, true).upload.length).toBe(3);
  });

  it('is in sync when files and configuration match', () => {
    const remote = [
      file('staging/game.config.json', 'CONFIG'),
      file('staging/files.json', 'X'),
      ...build.files.map(f => file(`staging/assets/content/${f.file}`, f.sha256)),
    ];
    expect(isInSync(planFromListing('staging', build, remote, build.hash))).toBe(true);
  });

  it('never touches another environment', () => {
    const remote = [file('production/game.config.json', 'P')];
    expect(planFromListing('staging', build, remote, null).remove).toEqual([]);
  });

  it('indexes every file with its size and a short checksum for the app', () => {
    expect(fileIndex(build)['/assets/content/entries/one/image.jpg']).toEqual({ size: 10, v: 'aaa111' });
  });

  it('spots videos a build without the git-ignored videos would take off the CDN', () => {
    const remote = [
      file('staging/assets/content/entries/one/image.jpg', 'AAA111'),
      file('staging/assets/content/entries/one/video.mp4', 'V'),
      folder('staging/assets/content/entries/gone'),
      file('staging/assets/content/entries/gone/video.mp4', 'W'),
    ];
    const plan = planFromListing('staging', build, remote, null);
    expect(videosMissingLocally(plan)).toEqual(['staging/assets/content/entries/one/video.mp4']);
  });
});
