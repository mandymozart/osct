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
 *   osct targets prepare --experience <id> [--dry-run] [--force] [--all]
 *
 * Environment (or a scripts/.env file, never committed):
 *   OSCT_CONTENT_DIR             the content source (absolute or relative to the repository; fixtures/content for
 *                                the test fixture; required for build – no default)
 *   OSCT_CONTENT_ENV             environment when --env is not given: staging | production | demo
 *   OSCT_BUNNY_STORAGE_ZONE      storage zone (osct)
 *   OSCT_BUNNY_STORAGE_ENDPOINT  Storage API host (storage.bunnycdn.com)
 *   OSCT_BUNNY_STORAGE_PASSWORD  the zone's access key (read-only is enough for status and purge --dry-run)
 *   OSCT_CONTENT_BASE_URL        the environment's CDN URL – sync checks what the CDN serves; purge requires it
 *   OSCT_APP_URL                 the site the reader runs on (optional) – the CDN check asks with its origin (CORS)
 * The same names as the server's settings (docs/server.md, #33).
 *   OSCT_API_URL                 targets prepare: the instance's API (default: the local dev API, http://127.0.0.1:8080/api)
 *   OSCT_EDITOR_TOKEN            targets prepare: a person's editor token (the editor's experiences page, AI connections)
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
import { describePlan, editorApi, planTargets, prepareTargets } from './lib/targets-prepare';
import { StorageClient } from './lib/storage';
import { DEMO_ENV } from './config';
import { ENV_NAME } from '../../shared/api/rules';

// scripts/.env is loaded by config.ts (imported through lib/content-sync)
const here = path.dirname(fileURLToPath(import.meta.url));

const OPTIONS = { flags: ['force', 'dry-run', 'without-videos', 'unknown', 'help', 'all'], values: ['env', 'min-age', 'keep', 'experience'] };
/** The local dev API (as the MCP server's default) */
const LOCAL_API = 'http://127.0.0.1:8080/api';

const USAGE = `osct – content command line

  osct content build [--force]                 build the content source (OSCT_CONTENT_DIR)
  osct content status --env <env>              versions on the storage, what the CDN serves, whether
                                               latest.json and versions.json agree (exit code 1 if not)
  osct content sync --env <env> [--force] [--dry-run] [--without-videos]
                                               upload the build as a version and make it current
  osct content purge --env <env> [--dry-run] [--min-age <days>] [--keep <n>] [--unknown]
                                               delete old versions that are provably out of use
                                               (defaults: --min-age ${DEFAULT_PURGE.minAgeDays} --keep ${DEFAULT_PURGE.keep})
  osct targets prepare --experience <id> [--dry-run] [--force] [--all]
                                               make the targets' recognition data ahead (#306) on an instance
                                               (--all: switched-off targets too):
                                               OSCT_API_URL (default the local dev API), OSCT_EDITOR_TOKEN

<env>: staging | production, demo for the demo (fixtures/demo). Storage access: OSCT_BUNNY_STORAGE_ZONE, OSCT_BUNNY_STORAGE_ENDPOINT,
OSCT_BUNNY_STORAGE_PASSWORD, OSCT_CONTENT_BASE_URL, optionally OSCT_APP_URL (environment variables or scripts/.env).
docs/content-cdn.md`;

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (environment variable or scripts/.env)`);
  return value;
};

const environment = (cli: CliArgs): string => {
  const env = cli.option('env') ?? process.env.OSCT_CONTENT_ENV;
  if (!env || !ENV_NAME.test(env)) {
    throw new Error(`Name the environment: --env staging | production, or ${DEMO_ENV} for the demo – lower-case letters, digits and -, a letter first, at most 32`);
  }
  return env;
};

const storage = () =>
  new StorageClient({
    endpoint: required('OSCT_BUNNY_STORAGE_ENDPOINT'),
    zone: required('OSCT_BUNNY_STORAGE_ZONE'),
    accessKey: required('OSCT_BUNNY_STORAGE_PASSWORD'),
  });

const baseUrl = () => process.env.OSCT_CONTENT_BASE_URL?.replace(/\/+$/, '');

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
    console.log(`🌐 CDN latest.json: ${seen.manifest?.build ?? seen.status}${seen.cors === false ? ' (no CORS header)' : seen.cors === null ? ' (CORS not checked: OSCT_APP_URL unset)' : ''}`);
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

/** `osct targets prepare` (#306): the targets without recognition data (every one with --force, switched-off ones with --all), made and stored back */
async function targetsPrepare(cli: CliArgs): Promise<void> {
  const experience = cli.option('experience');
  if (!experience) throw new Error('Name the experience: --experience <id>');
  const apiUrl = (process.env.OSCT_API_URL?.trim() || LOCAL_API).replace(/\/+$/, '');
  const api = editorApi(apiUrl, required('OSCT_EDITOR_TOKEN'));
  const plan = planTargets(await api.tree(experience), { force: cli.flag('force'), all: cli.flag('all'), origin: new URL(apiUrl).origin });
  console.log(`🎯 ${experience} on ${apiUrl}`);
  describePlan(plan).forEach(line => console.log(line));
  if (cli.flag('dry-run')) {
    console.log('Dry run – nothing changed.');
    return;
  }
  const done = await prepareTargets(api, experience, plan, line => console.log(line));
  const ms = done.reduce((sum, target) => sum + target.makeMs, 0);
  console.log(`✅ ${done.length} targets prepared${done.length ? ` (${Math.round(ms / done.length)} ms each here)` : ''} – the draft has them; publish to reach readers`);
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2), OPTIONS);
  const { flag } = cli;
  const [group, command] = cli.positional;
  if (group === 'targets' && command === 'prepare' && !flag('help')) return targetsPrepare(cli);
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
        throw new Error(`This build is the demo (fixtures/demo) – it goes to --env ${DEMO_ENV} only, never where the experience's current version is`);
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
      if (!url) throw new Error('OSCT_CONTENT_BASE_URL is not set – purge checks which version the CDN serves');
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
