#!/usr/bin/env node
/**
 * osct – the content command line (docs/content-cdn.md). Content has its own lifecycle, apart from the app
 * deployment: build it from a content folder, upload it as a new version to the CDN folder of an environment,
 * purge old versions that are provably out of use. Who runs it (a person, a workflow) does not matter – it only
 * needs the environment variables.
 *
 *   osct content build [--force]
 *   osct content status --env <env>
 *   osct content sync   --env <env> [--force] [--dry-run] [--without-videos]
 *   osct content purge  --env <env> [--dry-run] [--min-age <days>] [--keep <n>] [--unknown]
 *
 * Environment (or a scripts/.env file, never committed):
 *   OSCT_CONTENT_DIR             the content source (absolute or relative to the repository; fixtures/content for
 *                                the test fixture; default: a local content/ folder)
 *   OSCT_CONTENT_ENV             environment when --env is not given: staging | production | demo
 *   BUNNY_STORAGE_ZONE           storage zone (osct)
 *   BUNNY_STORAGE_ZONE_ENDPOINT  Storage API host (storage.bunnycdn.com)
 *   BUNNY_STORAGE_PASSWORD       the zone's access key (read-only is enough for status and purge --dry-run)
 *   CONTENT_BASE_URL             the environment's CDN URL – sync checks what the CDN serves; purge requires it
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  cdnManifest,
  checkCdn,
  DEFAULT_PURGE,
  describePurge,
  describeSync,
  isDemoBuild,
  isFixtureBuild,
  planPurge,
  planSync,
  readContentBuild,
  readEnvironment,
  runPurge,
  runSync,
} from './lib/content-sync';
import { StorageClient } from './lib/storage';
import { DEMO_ENV } from './config';

// scripts/.env is loaded by config.ts (imported through lib/content-sync)
const here = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const VALUE_OPTIONS = ['env', 'min-age', 'keep'];
const option = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const flag = (name: string): boolean => args.includes(`--${name}`);
const positional = args.filter((a, i) => !a.startsWith('--') && !VALUE_OPTIONS.some(o => args[i - 1] === `--${o}`));

const USAGE = `osct – content command line

  osct content build [--force]                 build the content source (OSCT_CONTENT_DIR)
  osct content status --env <env>              versions on the storage, what the CDN serves
  osct content sync --env <env> [--force] [--dry-run] [--without-videos]
                                               upload the build as a version and make it current
  osct content purge --env <env> [--dry-run] [--min-age <days>] [--keep <n>] [--unknown]
                                               delete old versions that are provably out of use
                                               (defaults: --min-age ${DEFAULT_PURGE.minAgeDays} --keep ${DEFAULT_PURGE.keep})

<env>: staging | production, demo for the demo book (fixtures/demo). Storage access: BUNNY_STORAGE_ZONE, BUNNY_STORAGE_ZONE_ENDPOINT,
BUNNY_STORAGE_PASSWORD, CONTENT_BASE_URL (environment variables or scripts/.env). docs/content-cdn.md`;

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (environment variable or scripts/.env)`);
  return value;
};

const environment = (): string => {
  const env = option('env') ?? process.env.OSCT_CONTENT_ENV;
  if (!env || !/^[a-z][a-z0-9-]*$/.test(env)) throw new Error('Name the environment: --env staging | production');
  return env;
};

const number = (name: string, fallback: number): number => {
  const value = option(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${name} needs a number ≥ 0`);
  return parsed;
};

const storage = () =>
  new StorageClient({
    endpoint: required('BUNNY_STORAGE_ZONE_ENDPOINT'),
    zone: required('BUNNY_STORAGE_ZONE'),
    accessKey: required('BUNNY_STORAGE_PASSWORD'),
  });

const baseUrl = () => process.env.CONTENT_BASE_URL?.replace(/\/+$/, '');

async function status(env: string): Promise<void> {
  const state = await readEnvironment(storage(), env);
  const current = state.current
    ? `${state.current.build} (schema ${state.current.schema}, since ${state.current.activatedAt})`
    : state.current === null ? 'not readable' : 'none';
  console.log(`📍 ${env}/latest.json: ${current}`);
  const versions = state.versions ?? [];
  for (const v of versions) {
    console.log(`   ${v.build}  schema ${v.schema}  app ${v.version}  current ${v.activatedAt} → ${v.retiredAt ?? 'now'}`);
  }
  const recorded = new Set(versions.map(v => v.build));
  state.listing
    .filter(i => !(i.isDirectory && recorded.has(i.path.split('/').pop()!)) && !/\/(latest|versions)\.json$/.test(i.path))
    .forEach(i => console.log(`   ? ${i.path}${i.isDirectory ? '/' : ''} (not a version on record)`));
  const url = baseUrl();
  if (url) {
    const seen = await cdnManifest(url);
    console.log(`🌐 CDN latest.json: ${seen.manifest?.build ?? seen.status}${seen.cors ? '' : ' (no CORS header)'}`);
  }
}

async function main(): Promise<void> {
  const [group, command] = positional;
  if (group !== 'content' || !command) {
    console.log(USAGE);
    if (group && group !== 'help') process.exitCode = 1;
    return;
  }
  switch (command) {
    case 'build': {
      const result = spawnSync(process.execPath, [path.join(here, 'index.js'), ...(flag('force') ? ['--force'] : [])], { stdio: 'inherit' });
      process.exitCode = result.status ?? 1;
      return;
    }
    case 'status':
      return status(environment());
    case 'sync': {
      const env = environment();
      const build = readContentBuild();
      if (isFixtureBuild(build)) {
        throw new Error('This build is the test fixture (fixtures/content) – build the content source first (OSCT_CONTENT_DIR)');
      }
      if (isDemoBuild(build) && env !== DEMO_ENV) {
        throw new Error(`This build is the demo book (fixtures/demo) – it goes to --env ${DEMO_ENV} only, never where the book's current version is`);
      }
      const client = storage();
      const plan = await planSync(client, env, build, flag('force'));
      describeSync(plan).forEach(line => console.log(line));
      if (plan.missingVideos.length > 0) {
        const message = `${plan.missingVideos.length} videos of the current version are missing in this build although their entries stay ` +
          '(a checkout without the git-ignored videos?)';
        if (!flag('without-videos')) throw new Error(`${message}. Sync from a machine that has them, or pass --without-videos.`);
        console.warn(`⚠️  ${message} – syncing anyway (--without-videos)`);
      }
      if (plan.uploaded && plan.current) {
        console.log(`✅ ${env}/ is up to date`);
        return;
      }
      if (flag('dry-run')) {
        console.log('Dry run – nothing changed.');
        return;
      }
      await runSync(client, plan);
      const url = baseUrl();
      if (url) await checkCdn(url, build);
      return;
    }
    case 'purge': {
      const env = environment();
      const url = baseUrl();
      // Strict: what the CDN serves counts as in use, so the check needs the CDN URL
      if (!url) throw new Error('CONTENT_BASE_URL is not set – purge checks which version the CDN serves');
      const client = storage();
      const [state, seen] = await Promise.all([readEnvironment(client, env), cdnManifest(url)]);
      if (!seen.manifest && !seen.status.startsWith('404')) {
        throw new Error(`The CDN's latest.json could not be read (${seen.status}) – nothing is purged without knowing what it serves`);
      }
      const plan = planPurge(state, seen.manifest?.build ?? null, Date.now(), {
        minAgeDays: number('min-age', DEFAULT_PURGE.minAgeDays),
        keep: number('keep', DEFAULT_PURGE.keep),
        unknown: flag('unknown'),
      });
      console.log(`🌐 CDN latest.json: ${seen.manifest?.build ?? seen.status}`);
      describePurge(plan).forEach(line => console.log(line));
      if (!plan.items.some(i => i.purge)) {
        console.log('Nothing to purge.');
        return;
      }
      if (flag('dry-run')) {
        console.log('Dry run – nothing deleted.');
        return;
      }
      await runPurge(client, plan);
      console.log('✅ Purged. CDN edges may keep copies of deleted files until their cache time ends.');
      return;
    }
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
