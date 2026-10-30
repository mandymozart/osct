#!/usr/bin/env node
/**
 * osct – the content command line (docs/content-cdn.md). Content has its own lifecycle, apart from the app
 * deployment: build it from a content folder, upload it as a new version to the CDN folder of an environment,
 * purge old versions that are provably out of use. Who runs it (a person, a workflow) does not matter – it only
 * needs the environment variables.
 *
 *   osct content build [--force]
 *   osct content status --env <env>          (exit code 1 when latest.json and versions.json disagree on the storage)
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
  cdnVersions,
  checkCdn,
  DEFAULT_PURGE,
  describePurge,
  describeSync,
  isDemoBuild,
  isFixtureBuild,
  nameOf,
  planPurge,
  planSync,
  readContentBuild,
  readEnvironment,
  runPurge,
  runSync,
  versionProblems,
} from './lib/content-sync';
import { type CliArgs, parseArgs } from './lib/cli-args';
import { messageOf } from './lib/errors';
import { StorageClient } from './lib/storage';
import { DEMO_ENV } from './config';
import { ENV_NAME } from '../../shared/api/rules';

// scripts/.env is loaded by config.ts (imported through lib/content-sync)
const here = path.dirname(fileURLToPath(import.meta.url));

const OPTIONS = { flags: ['force', 'dry-run', 'without-videos', 'unknown', 'help'], values: ['env', 'min-age', 'keep'] };

const USAGE = `osct – content command line

  osct content build [--force]                 build the content source (OSCT_CONTENT_DIR)
  osct content status --env <env>              versions on the storage, what the CDN serves, whether
                                               latest.json and versions.json agree (exit code 1 if not)
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

const environment = (cli: CliArgs): string => {
  const env = cli.option('env') ?? process.env.OSCT_CONTENT_ENV;
  if (!env || !ENV_NAME.test(env)) {
    throw new Error(`Name the environment: --env staging | production, or ${DEMO_ENV} for the demo book – lower-case letters, digits and -, a letter first, at most 32`);
  }
  return env;
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
    .filter(i => !(i.isDirectory && recorded.has(nameOf(i))) && !/\/(latest|versions)\.json$/.test(i.path))
    .forEach(i => console.log(`   ? ${i.path}${i.isDirectory ? '/' : ''} (not a version on record)`));
  // The bookkeeping on the storage: latest.json must name a build versions.json records as current (#175)
  const bullets = (items: string[]) => items.map(item => `\n   - ${item}`).join('');
  const problems = versionProblems(state.current, state.versions);
  if (problems.length > 0) {
    console.warn(`⚠️  ${env}: latest.json and versions.json disagree on the storage – \`osct content sync\` of the current build repairs versions.json${bullets(problems)}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ ${env}: latest.json and versions.json agree on the storage`);
  }
  const url = baseUrl();
  if (url) {
    const [seen, record] = await Promise.all([cdnManifest(url), cdnVersions(url)]);
    console.log(`🌐 CDN latest.json: ${seen.manifest?.build ?? seen.status}${seen.cors ? '' : ' (no CORS header)'}`);
    // What a reader of the CDN sees: an edge without the cache rule for versions.json serves an old copy (warning only)
    const edge = seen.manifest && record.versions ? versionProblems(seen.manifest, record.versions) : [];
    if (edge.length > 0) {
      console.warn(`⚠️  CDN versions.json (${record.status}) disagrees with its latest.json – the edge caches versions.json; ` +
        `add the edge rule for it and purge it (docs/content-cdn.md)${bullets(edge)}`);
    } else {
      console.log(`🌐 CDN versions.json: ${record.versions ? 'agrees with latest.json' : record.status}`);
    }
  }
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2), OPTIONS);
  const { flag } = cli;
  const [group, command] = cli.positional;
  if (group !== 'content' || !command || flag('help')) {
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
      return status(environment(cli));
    case 'sync': {
      const env = environment(cli);
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
      if (plan.uploaded && plan.current && plan.agrees) {
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
      const env = environment(cli);
      const url = baseUrl();
      // Strict: what the CDN serves counts as in use, so the check needs the CDN URL
      if (!url) throw new Error('CONTENT_BASE_URL is not set – purge checks which version the CDN serves');
      const client = storage();
      const [state, seen] = await Promise.all([readEnvironment(client, env), cdnManifest(url)]);
      if (!seen.manifest && !seen.status.startsWith('404')) {
        throw new Error(`The CDN's latest.json could not be read (${seen.status}) – nothing is purged without knowing what it serves`);
      }
      const plan = planPurge(state, seen.manifest?.build ?? null, Date.now(), {
        minAgeDays: cli.number('min-age', DEFAULT_PURGE.minAgeDays),
        keep: cli.number('keep', DEFAULT_PURGE.keep),
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
  console.error(`❌ ${messageOf(error)}`);
  process.exit(1);
});
