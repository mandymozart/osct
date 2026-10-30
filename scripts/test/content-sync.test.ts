import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { DEMO_DIR, DEMO_MARKER, FIXTURE_DIR, FIXTURE_MARKER, projectRoot } from '../src/config';
import { type ContentVersion, isContentManifest } from '../../shared/types/content-manifest';
import {
  activate,
  type ContentBuild,
  DEFAULT_PURGE,
  ENV_NAME,
  type EnvironmentState,
  fileIndex,
  isDemoBuild,
  isFixtureBuild,
  planPurge,
  versionProblems,
  videosMissing,
} from '../src/lib/content-sync';
import type { StoredFile } from '../src/lib/storage';

/**
 * Content versions on the CDN: every content build is its own immutable folder, latest.json names the current one,
 * versions.json records when each was current. Purge removes only versions that are provably out of use.
 * Planned from storage listings – no storage zone needed.
 */
const build: ContentBuild = {
  build: 'aaaaaaaaaaaa',
  hash: 'a'.repeat(64),
  schema: '1.1',
  version: '1.7.2',
  config: Buffer.from('{}'),
  files: [
    { file: 'entries/one/image.jpg', size: 10, sha256: 'AAA111' },
    { file: 'entries/two/target.jpg', size: 20, sha256: 'BBB222' },
  ],
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-12-31T00:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

const version = (name: string, activatedDaysAgo: number, retiredDaysAgo: number | null): ContentVersion => ({
  build: name,
  hash: name.padEnd(64, '0'),
  schema: '1.1',
  version: '1.7.2',
  uploadedAt: daysAgo(activatedDaysAgo),
  activatedAt: daysAgo(activatedDaysAgo),
  retiredAt: retiredDaysAgo === null ? null : daysAgo(retiredDaysAgo),
});

const folder = (name: string): StoredFile => ({ path: `staging/${name}`, size: 0, isDirectory: true, checksum: null });
const file = (name: string): StoredFile => ({ path: `staging/${name}`, size: 1, isDirectory: false, checksum: null });

const OLDER = '000000000001';
const OLD = '000000000002';
const RECENT = '000000000003';
const CURRENT = '000000000004';

/** Four versions: two retired long ago, one retired yesterday, one current */
const state = (overrides: Partial<EnvironmentState> = {}): EnvironmentState => ({
  env: 'staging',
  current: { build: CURRENT, hash: CURRENT, schema: '1.1', version: '1.7.2', activatedAt: daysAgo(1) },
  versions: [version(OLDER, 120, 90), version(OLD, 90, 60), version(RECENT, 60, 1), version(CURRENT, 1, null)],
  listing: [file('latest.json'), file('versions.json'), folder(OLDER), folder(OLD), folder(RECENT), folder(CURRENT)],
  ...overrides,
});

const purged = (plan: ReturnType<typeof planPurge>) => plan.items.filter(i => i.purge).map(i => i.target);

describe('content versions', () => {
  it('records a new current version and retires the previous one', () => {
    const before = [version(OLD, 10, 5), version(RECENT, 5, null)];
    const after = activate(before, build, '2026-12-31T00:00:00.000Z', true);
    expect(after.find(v => v.build === RECENT)?.retiredAt).toBe('2026-12-31T00:00:00.000Z');
    expect(after.find(v => v.build === OLD)?.retiredAt).toBe(before[0].retiredAt);
    expect(after.filter(v => v.retiredAt === null).map(v => v.build)).toEqual([build.build]);
  });

  it('rolls back to a version that is still on the storage without uploading it again', () => {
    const before = [version(build.build, 10, 5), version(RECENT, 5, null)];
    const after = activate(before, build, '2026-12-31T00:00:00.000Z', false);
    const entry = after.find(v => v.build === build.build)!;
    expect(entry.retiredAt).toBeNull();
    expect(entry.uploadedAt).toBe(before[0].uploadedAt);
    expect(entry.activatedAt).toBe('2026-12-31T00:00:00.000Z');
  });

  it('records which book a version is of', () => {
    const after = activate([], { ...build, book: 'osct' }, '2026-12-31T00:00:00.000Z', true);
    expect(after[0].book).toBe('osct');
    expect(activate([], build, '2026-12-31T00:00:00.000Z', true)[0]).not.toHaveProperty('book');
  });

  it('reads manifests with and without the book', () => {
    const manifest = { build: CURRENT, hash: CURRENT, schema: '2.11', version: '1.22.0', activatedAt: daysAgo(1) };
    expect(isContentManifest(manifest)).toBe(true);
    expect(isContentManifest({ ...manifest, book: 'demo' })).toBe(true);
    expect(isContentManifest({ ...manifest, book: 7 })).toBe(false);
  });

  it('spots videos a build without the git-ignored videos would drop', () => {
    const current = {
      '/assets/content/entries/one/image.jpg': { size: 1, v: 'x' },
      '/assets/content/entries/one/video.mp4': { size: 1, v: 'x' },
      '/assets/content/entries/gone/video.mp4': { size: 1, v: 'x' },
    };
    expect(videosMissing(current, build)).toEqual(['/assets/content/entries/one/video.mp4']);
    expect(videosMissing(null, build)).toEqual([]);
  });

  it('indexes every file with its size and a short checksum', () => {
    expect(fileIndex(build)['/assets/content/entries/one/image.jpg']).toEqual({ size: 10, v: 'aaa111' });
  });
});

describe('latest.json and versions.json agree (#175)', () => {
  const { current, versions } = state();

  it('agree when versions.json records the build latest.json names as its only current one, or when neither exists', () => {
    expect(versionProblems(current, versions)).toEqual([]);
    expect(versionProblems(undefined, undefined)).toEqual([]);
    expect(versionProblems(undefined, [version(OLD, 10, 5)])).toEqual([]);
  });

  it("staging's case: latest.json names a build versions.json does not list", () => {
    expect(versionProblems(current, [version(OLD, 10, null)])).toEqual([
      `versions.json does not list ${CURRENT}, the build latest.json names`,
      `versions.json has ${OLD} as current, latest.json names ${CURRENT}`,
    ]);
  });

  it('listed, but retired, or another version still open', () => {
    expect(versionProblems(current, [version(CURRENT, 10, 5)])).toEqual([`versions.json has no version as current, latest.json names ${CURRENT}`]);
    expect(versionProblems(current, [version(OLD, 10, null), version(CURRENT, 5, null)])).toEqual([
      `versions.json has ${OLD}, ${CURRENT} as current, latest.json names ${CURRENT}`,
    ]);
  });

  it('missing or unreadable files', () => {
    expect(versionProblems(current, undefined)).toEqual([`versions.json is missing (latest.json names ${CURRENT})`]);
    expect(versionProblems(undefined, [version(OLD, 10, null)])).toEqual([`latest.json is missing, versions.json has ${OLD} as current`]);
    expect(versionProblems(null, null)).toEqual(['latest.json is not readable', 'versions.json is not readable']);
    expect(versionProblems(current, null)).toEqual(['versions.json is not readable']);
  });
});

describe('purge', () => {
  it('deletes only versions retired long ago, keeping the newest retired one for rollback', () => {
    const plan = planPurge(state(), CURRENT, NOW, DEFAULT_PURGE);
    // RECENT is the newest retired (kept, and too recent anyway); OLD and OLDER went 60 and 90 days ago
    expect(purged(plan)).toEqual([`staging/${OLDER}/`, `staging/${OLD}/`]);
    expect(plan.versions.map(v => v.build)).toEqual([RECENT, CURRENT]);
  });

  it('keeps more versions with --keep and younger ones with --min-age', () => {
    expect(purged(planPurge(state(), CURRENT, NOW, { ...DEFAULT_PURGE, keep: 2 }))).toEqual([`staging/${OLDER}/`]);
    expect(purged(planPurge(state(), CURRENT, NOW, { ...DEFAULT_PURGE, minAgeDays: 70 }))).toEqual([`staging/${OLDER}/`]);
    expect(purged(planPurge(state(), CURRENT, NOW, { ...DEFAULT_PURGE, keep: 0, minAgeDays: 0 }))).toEqual([
      `staging/${OLDER}/`,
      `staging/${OLD}/`,
      `staging/${RECENT}/`,
    ]);
  });

  it('never deletes the current version or the one the CDN still serves', () => {
    const plan = planPurge(state(), OLD, NOW, { ...DEFAULT_PURGE, keep: 0, minAgeDays: 0 });
    expect(purged(plan)).toEqual([`staging/${OLDER}/`, `staging/${RECENT}/`]);
    expect(plan.items.find(i => i.build === OLD)?.verdict).toMatch(/served by the CDN/);
    expect(plan.items.find(i => i.build === CURRENT)?.verdict).toBe('current version');
  });

  it('leaves folders and files that are not versions on record unless asked to', () => {
    const listing = [...state().listing, folder('assets'), file('game.config.json'), folder('1.6.0-29a25c7416d2')];
    expect(purged(planPurge(state({ listing }), CURRENT, NOW, DEFAULT_PURGE))).toEqual([`staging/${OLDER}/`, `staging/${OLD}/`]);
    expect(purged(planPurge(state({ listing }), CURRENT, NOW, { ...DEFAULT_PURGE, unknown: true }))).toEqual([
      `staging/${OLDER}/`,
      `staging/${OLD}/`,
      'staging/assets/',
      'staging/game.config.json',
      'staging/1.6.0-29a25c7416d2/',
    ]);
  });

  it('refuses without a current version or a version record, or when they disagree', () => {
    expect(() => planPurge(state({ current: undefined }), null, NOW, DEFAULT_PURGE)).toThrow(/latest.json is missing/);
    expect(() => planPurge(state({ current: null }), null, NOW, DEFAULT_PURGE)).toThrow(/not readable/);
    expect(() => planPurge(state({ versions: undefined }), null, NOW, DEFAULT_PURGE)).toThrow(/versions.json is missing/);
    const stillOpen = [version(OLD, 90, null), version(CURRENT, 1, null)];
    expect(() => planPurge(state({ versions: stillOpen }), null, NOW, DEFAULT_PURGE)).toThrow(/does not agree/);
    const unlisted = [version(OLD, 90, 60)];
    expect(() => planPurge(state({ versions: unlisted }), null, NOW, DEFAULT_PURGE)).toThrow(/does not list the current version/);
    const missingFolder = state().listing.filter(i => !i.path.endsWith(CURRENT));
    expect(() => planPurge(state({ listing: missingFolder }), null, NOW, DEFAULT_PURGE)).toThrow(/not on the storage/);
  });
});

// The book content is not in the repository; CI and the tests build the fixture, which must never reach the CDN
describe('test fixture', () => {
  it('is a content folder that marks itself', () => {
    expect(fs.existsSync(path.join(FIXTURE_DIR, 'book.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(FIXTURE_DIR, FIXTURE_MARKER))).toBe(true);
  });

  it('is recognised in a build, so sync refuses it', () => {
    expect(isFixtureBuild(build)).toBe(false);
    expect(isFixtureBuild({ files: [...build.files, { file: FIXTURE_MARKER, size: 1, sha256: 'A' }] })).toBe(true);
    // only the marker at the top of the build counts
    expect(isFixtureBuild({ files: [{ file: `entries/x/${FIXTURE_MARKER}`, size: 1, sha256: 'A' }] })).toBe(false);
  });
});

// The demo book is a content folder of its own next to the fixture; its build goes to the environment `demo` only
describe('demo book', () => {
  it('is a content folder that marks itself, apart from the fixture', () => {
    expect(fs.existsSync(path.join(DEMO_DIR, 'book.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(DEMO_DIR, DEMO_MARKER))).toBe(true);
    expect(fs.existsSync(path.join(DEMO_DIR, FIXTURE_MARKER))).toBe(false);
  });

  it('is recognised in a build (the CLI syncs it to its own environment only)', () => {
    expect(isDemoBuild(build)).toBe(false);
    expect(isDemoBuild({ files: [...build.files, { file: DEMO_MARKER, size: 1, sha256: 'A' }] })).toBe(true);
    expect(isDemoBuild({ files: [{ file: `entries/x/${DEMO_MARKER}`, size: 1, sha256: 'A' }] })).toBe(false);
  });
});

describe('environment names', () => {
  it('the CLI and the API share one rule (ContentStore::ENV)', () => {
    const php = fs.readFileSync(path.join(projectRoot, 'server', 'api', 'src', 'ContentStore.php'), 'utf8');
    const rule = /public const ENV = '([^']+)';/.exec(php)?.[1];
    expect(rule).toBeDefined();
    expect(ENV_NAME.source).toBe(`^${rule}$`);
  });

  it('takes staging, production, demo and an instance of its own; refuses the rest', () => {
    for (const env of ['staging', 'production', 'demo', 'white-label-2', 'a'.repeat(32)]) expect(ENV_NAME.test(env)).toBe(true);
    for (const env of ['', 'Staging', '2staging', '-x', 'a_b', 'a'.repeat(33)]) expect(ENV_NAME.test(env)).toBe(false);
  });
});
