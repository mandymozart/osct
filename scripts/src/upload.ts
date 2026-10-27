/**
 * Content upload: the built bundle (`client/src/game.config.json` + `client/public/assets/content/`) goes to
 * bunny.net Edge Storage, where the CDN serves it to the app (docs/content-cdn.md).
 *
 *   <zone>/<env>/<build>/game.config.json      the game configuration – uploaded last (marks the bundle complete)
 *   <zone>/<env>/<build>/files.json            file sizes by path, for the whole-book download
 *   <zone>/<env>/<build>/assets/content/…      the content files, paths as in the app
 *   <zone>/<env>/latest.json                   manifest pointing at the current build (shared/types/content-manifest.ts)
 *
 * A build folder is immutable: a bundle that is already there (its game.config.json exists) is not uploaded
 * again, only `latest.json` is rewritten. `--force` re-uploads, `--dry-run` only lists.
 *
 * Environment: OSCT_CONTENT_ENV (or --env) = staging | production; BUNNY_STORAGE_ZONE, BUNNY_STORAGE_ZONE_ENDPOINT,
 * BUNNY_STORAGE_PASSWORD (the zone's read/write key); CONTENT_BASE_URL (optional) = the CDN URL of the
 * environment – when set, the upload is checked through the CDN afterwards.
 */
import fs from 'fs';
import path from 'path';
import { CONTENT_SCHEMA_VERSION } from '../../shared/types/game-config';
import { ContentManifest, contentBuildName, isContentManifest } from '../../shared/types/content-manifest';
import { CLIENT_PUBLIC_ASSETS_DIR, OUTPUT_FILE } from './config';
import { listFiles } from './lib/files';
import { contentTypeOf, StorageClient } from './lib/storage';

const PARALLEL_UPLOADS = 4;
/** The CDN check waits this long for the new `latest.json` to show at the edge */
const CDN_CHECK_TIMEOUT_MS = 60_000;

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

interface Bundle {
  build: string;
  manifest: ContentManifest;
  config: string;
  files: Array<{ file: string; size: number }>; // relative to the public content folder
  sizes: Record<string, number>; // by app URL path (`/assets/content/…`)
}

const readBundle = (): Bundle => {
  if (!fs.existsSync(OUTPUT_FILE) || !fs.existsSync(CLIENT_PUBLIC_ASSETS_DIR)) {
    throw new Error('No content build found – run `npm run build:content` first');
  }
  const config = fs.readFileSync(OUTPUT_FILE, 'utf8');
  const { version } = JSON.parse(config) as { version: { version: string; hash?: string; schema?: number } };
  if (!version?.hash) throw new Error(`${OUTPUT_FILE} has no version.hash`);
  const build = contentBuildName(version.version, version.hash);
  const files = listFiles(CLIENT_PUBLIC_ASSETS_DIR).map(file => ({
    file,
    size: fs.statSync(path.join(CLIENT_PUBLIC_ASSETS_DIR, file)).size,
  }));
  const sizes = Object.fromEntries(files.map(({ file, size }) => [`/assets/content/${file}`, size]));
  const manifest: ContentManifest = {
    build,
    version: version.version,
    schema: version.schema ?? CONTENT_SCHEMA_VERSION,
    hash: version.hash,
    uploadedAt: new Date().toISOString(),
  };
  return { build, manifest, config, files, sizes };
};

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function uploadBundle(storage: StorageClient, env: string, bundle: Bundle, force: boolean): Promise<boolean> {
  const root = `${env}/${bundle.build}`;
  if (!force && (await storage.exists(`${root}/game.config.json`))) {
    console.log(`✅ Bundle ${root} is already on the storage – nothing to upload`);
    return false;
  }
  const total = bundle.files.reduce((sum, f) => sum + f.size, 0);
  console.log(`⬆️  Uploading ${bundle.files.length} files (${mb(total)}) to ${root}/ …`);
  const queue = [...bundle.files];
  let uploaded = 0;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const data = fs.readFileSync(path.join(CLIENT_PUBLIC_ASSETS_DIR, next.file));
      await storage.put(`${root}/assets/content/${next.file}`, data, contentTypeOf(next.file));
      uploaded += next.size;
      console.log(`   ${next.file} (${Math.round(next.size / 1024)} KB, ${Math.round((uploaded / total) * 100)}%)`);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker));
  await storage.put(`${root}/files.json`, JSON.stringify(bundle.sizes), 'application/json');
  // Last: the configuration marks the bundle as complete
  await storage.put(`${root}/game.config.json`, bundle.config, 'application/json');
  console.log(`✅ Bundle ${root} uploaded`);
  return true;
}

/** The CDN serves the new manifest and the bundle's configuration (the manifest may take a moment at the edge) */
async function checkThroughCdn(baseUrl: string, bundle: Bundle): Promise<void> {
  console.log(`🔍 Checking ${baseUrl}/latest.json through the CDN …`);
  const deadline = Date.now() + CDN_CHECK_TIMEOUT_MS;
  let seen: unknown;
  let cors: string | null = null;
  for (;;) {
    const response = await fetch(`${baseUrl}/latest.json`, { headers: { Origin: 'https://osct.buildingfictions.com' } });
    cors = response.headers.get('access-control-allow-origin');
    seen = response.ok ? await response.json() : `${response.status} ${response.statusText}`;
    // The exact manifest just written (not an older upload of the same build still cached at the edge)
    if (isContentManifest(seen) && seen.hash === bundle.manifest.hash && seen.uploadedAt === bundle.manifest.uploadedAt) break;
    if (Date.now() > deadline) {
      throw new Error(`The CDN still serves another manifest after ${CDN_CHECK_TIMEOUT_MS / 1000} s: ${JSON.stringify(seen)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  const config = await fetch(`${baseUrl}/${bundle.build}/game.config.json`);
  if (!config.ok) throw new Error(`${baseUrl}/${bundle.build}/game.config.json: ${config.status} ${config.statusText}`);
  const { version } = (await config.json()) as { version: { hash?: string } };
  if (version?.hash !== bundle.manifest.hash) throw new Error('The configuration served by the CDN has another hash');
  console.log(`✅ CDN serves build ${bundle.build}`);
  if (!cors) {
    console.warn('⚠️  The CDN sends no Access-Control-Allow-Origin header – the app (another origin) cannot read the content. Enable CORS headers on the pull zone.');
  }
}

async function main(): Promise<void> {
  const env = argument('env') ?? process.env.OSCT_CONTENT_ENV;
  if (!env || !/^[a-z][a-z0-9-]*$/.test(env)) throw new Error('Set OSCT_CONTENT_ENV (or --env) to the environment: staging | production');
  const dryRun = flag('dry-run');
  const bundle = readBundle();
  console.log(`📦 Content build ${bundle.build} (schema ${bundle.manifest.schema}, ${bundle.files.length} files) → ${env}/`);
  if (dryRun) {
    bundle.files.forEach(f => console.log(`   ${f.file} (${Math.round(f.size / 1024)} KB)`));
    console.log('Dry run – nothing uploaded.');
    return;
  }
  const storage = new StorageClient({
    endpoint: required('BUNNY_STORAGE_ZONE_ENDPOINT'),
    zone: required('BUNNY_STORAGE_ZONE'),
    accessKey: required('BUNNY_STORAGE_PASSWORD'),
  });
  await uploadBundle(storage, env, bundle, flag('force'));
  await storage.put(`${env}/latest.json`, JSON.stringify(bundle.manifest, null, 2), 'application/json');
  console.log(`✅ ${env}/latest.json → ${bundle.build}`);

  const baseUrl = process.env.CONTENT_BASE_URL?.replace(/\/+$/, '');
  if (baseUrl) await checkThroughCdn(baseUrl, bundle);
}

main().catch(error => {
  console.error(`❌ Content upload failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
