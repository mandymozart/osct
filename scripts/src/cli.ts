#!/usr/bin/env node
/**
 * osct – the content command line (docs/content-cdn.md). Content has its own lifecycle, apart from the app
 * deployment: build it from a content folder, look at what a sync would change, sync it to the CDN folder of an
 * environment. Who runs it (a person, a workflow) does not matter – it only needs the environment variables.
 *
 *   osct content build [--force]                      content folder → client/src/game.config.json + assets
 *   osct content status --env <env>                   what a sync would change (reads the storage only)
 *   osct content sync --env <env> [--force] [--dry-run]
 *
 * Environment (or a scripts/.env file, never committed):
 *   OSCT_CONTENT_DIR             content folder (default: content/ in the repository)
 *   OSCT_CONTENT_ENV             environment when --env is not given: staging | production
 *   BUNNY_STORAGE_ZONE           storage zone (osct)
 *   BUNNY_STORAGE_ZONE_ENDPOINT  Storage API host (storage.bunnycdn.com)
 *   BUNNY_STORAGE_PASSWORD       the zone's access key (read-only is enough for status)
 *   CONTENT_BASE_URL             optional: the environment's CDN URL – sync then checks what the CDN serves
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkCdn, describePlan, isInSync, planSync, readContentBuild, runSync } from './lib/content-sync';
import { StorageClient } from './lib/storage';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, '../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const flag = (name: string): boolean => args.includes(`--${name}`);

const USAGE = `osct – content command line

  osct content build [--force]                       build the content (OSCT_CONTENT_DIR, default content/)
  osct content status --env <staging|production>     what a sync would change
  osct content sync --env <staging|production> [--force] [--dry-run]
                                                     mirror the build to the CDN folder of the environment

Storage access: BUNNY_STORAGE_ZONE, BUNNY_STORAGE_ZONE_ENDPOINT, BUNNY_STORAGE_PASSWORD
(environment variables or scripts/.env). docs/content-cdn.md`;

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

const storage = () =>
  new StorageClient({
    endpoint: required('BUNNY_STORAGE_ZONE_ENDPOINT'),
    zone: required('BUNNY_STORAGE_ZONE'),
    accessKey: required('BUNNY_STORAGE_PASSWORD'),
  });

async function main(): Promise<void> {
  const [group, command] = args.filter(a => !a.startsWith('--') && a !== option('env'));
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
    case 'sync': {
      const env = environment();
      const build = readContentBuild();
      const client = storage();
      const plan = await planSync(client, env, build, flag('force'));
      const dryRun = command === 'status' || flag('dry-run');
      describePlan(plan, build, dryRun).forEach(line => console.log(line));
      if (isInSync(plan)) {
        console.log(`✅ ${env}/ is in sync`);
        return;
      }
      if (dryRun) {
        console.log('Nothing changed (status / dry run).');
        return;
      }
      await runSync(client, plan, build);
      const baseUrl = process.env.CONTENT_BASE_URL?.replace(/\/+$/, '');
      if (baseUrl) await checkCdn(baseUrl, build);
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
