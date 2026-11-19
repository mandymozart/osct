import { deleteAsset, errorText, listAssets, replaceAsset, setAssetCredits, uploadAsset, type Asset } from "./api";
import { CODE_EXTENSIONS } from "./library-code";
import { acceptOf } from "./library-pick";
import { ASSET_KINDS } from "@shared/api/rules";
import type { ImageFit, ImageUse } from "@shared/api/images";
import { fitOf, toWebp } from "./browser-webp";

/**
 * A picture the image rule converted (#298): the asset, and the file's name and size as it came – converted in the
 * browser before the upload (browser-webp.ts) or, as the fallback, by the API
 */
export interface Conversion {
  assetId: string;
  name: string;
  size: number;
}

/** The files the library accepts: the API's `Assets::KINDS` and scripts (they become plugin sources – #186) */
export const ACCEPT = [acceptOf(ASSET_KINDS), ...CODE_EXTENSIONS.script].join(",");

/**
 * The experience's library: the files uploaded in the editor (the API's assets – docs/server.md "Assets"), loaded per experience,
 * kept in step after an upload, a replace or a delete. Nodes and targets name an asset by its URL; `byUrl` finds the
 * asset behind a node's file.
 */
class Library {
  experienceId = $state<string | null>(null);
  assets = $state<Asset[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  /** Uploads in flight, by file name */
  uploading = $state<string[]>([]);
  /** The last upload or replace, when the image rule converted it (null otherwise) – the Library says what became of it */
  converted = $state<Conversion | null>(null);

  async load(experienceId: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.assets = (await listAssets(experienceId)).assets;
      this.experienceId = experienceId;
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.loading = false;
    }
  }

  byUrl(url: string | undefined): Asset | undefined {
    return url ? this.assets.find(asset => asset.url === url) : undefined;
  }

  /**
   * The asset behind a src the draft names: an upload's absolute URL, or an imported file's content path
   * (`/assets/content/…`), which its Library URL ends with (below the assets base)
   */
  bySrc(src: string | undefined): Asset | undefined {
    if (!src) return undefined;
    return this.byUrl(src) ?? (src.startsWith("/") ? this.assets.find(asset => asset.imported && asset.url.endsWith(src)) : undefined);
  }

  ofKinds(kinds: readonly string[]): Asset[] {
    return this.assets.filter(asset => kinds.includes(asset.kind));
  }

  /**
   * Upload a file; the asset (new, or the one that already holds these bytes). `fit` names the use of a picture where it
   * is known (`target`: cut to 1200 px – the image rule, #298). A picture becomes WebP in the browser first
   * (browser-webp.ts); the API converts what still comes unconverted.
   */
  async upload(experienceId: string, file: File, fit?: ImageFit | ImageUse): Promise<Asset> {
    this.uploading = [...this.uploading, file.name];
    this.error = null;
    try {
      const sent = await toWebp(file, fitOf(fit));
      const { asset, converted } = await uploadAsset(experienceId, sent.file, fit);
      this.converted = converted || sent.converted ?{ assetId: asset.id, name: file.name, size: file.size } : null;
      this.assets = [asset, ...this.assets.filter(a => a.id !== asset.id)];
      return asset;
    } catch (e) {
      this.error = `${file.name}: ${errorText(e)}`;
      throw e;
    } finally {
      this.uploading = this.uploading.filter(name => name !== file.name);
    }
  }

  /** A new version of an asset; every use in the experience now names it (the draft changed: reload the content) */
  async replace(experienceId: string, assetId: string, file: File, fit?: ImageFit | ImageUse): Promise<Asset> {
    this.uploading = [...this.uploading, file.name];
    this.error = null;
    try {
      const sent = await toWebp(file, fitOf(fit));
      const { asset, converted } = await replaceAsset(experienceId, assetId, sent.file, fit);
      this.converted = converted || sent.converted ?{ assetId: asset.id, name: file.name, size: file.size } : null;
      this.assets = this.assets.map(a => (a.id === asset.id ? asset : a));
      return asset;
    } catch (e) {
      this.error = `${file.name}: ${errorText(e)}`;
      throw e;
    } finally {
      this.uploading = this.uploading.filter(name => name !== file.name);
    }
  }

  /** Remove an asset; refused while used unless forced (the API answers 409 asset-in-use with the usages) */
  async remove(experienceId: string, assetId: string, force = false): Promise<void> {
    this.error = null;
    await deleteAsset(experienceId, assetId, force);
    this.assets = this.assets.filter(a => a.id !== assetId);
  }

  /** A file's credits line (#277): every asset of that URL shows the saved line */
  async setCredits(experienceId: string, url: string, credits: string): Promise<void> {
    this.error = null;
    try {
      const saved = (await setAssetCredits(experienceId, [{ url, credits }])).credits[url] ?? null;
      this.assets = this.assets.map(a => (a.url === url ? { ...a, credits: saved } : a));
    } catch (e) {
      this.error = errorText(e);
      throw e;
    }
  }

  /** The number of uses changed (a save): read the list again without a loading state */
  async refresh(): Promise<void> {
    if (!this.experienceId) return;
    try {
      this.assets = (await listAssets(this.experienceId)).assets;
    } catch {
      // the next load tells
    }
  }
}

export const library = new Library();
