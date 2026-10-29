import { ApiError, deleteAsset, listAssets, replaceAsset, uploadAsset, type Asset } from "./api";
import { acceptOf, KIND_EXTENSIONS, type AssetKind } from "./library-pick";

export { NODE_ASSET_KINDS } from "./library-pick";

/** The files the library accepts (the API's `Assets::KINDS`) */
export const ACCEPT = acceptOf(Object.keys(KIND_EXTENSIONS) as AssetKind[]);

/**
 * The book's library: the files uploaded in the editor (the API's assets – docs/server.md "Assets"), loaded per book,
 * kept in step after an upload, a replace or a delete. Nodes and targets name an asset by its URL; `byUrl` finds the
 * asset behind a node's file.
 */
class Library {
  bookId = $state<string | null>(null);
  assets = $state<Asset[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  /** Uploads in flight, by file name */
  uploading = $state<string[]>([]);

  async load(bookId: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.assets = (await listAssets(bookId)).assets;
      this.bookId = bookId;
    } catch (e) {
      this.error = e instanceof ApiError ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  byUrl(url: string | undefined): Asset | undefined {
    return url ? this.assets.find(asset => asset.url === url) : undefined;
  }

  ofKinds(kinds: readonly string[]): Asset[] {
    return this.assets.filter(asset => kinds.includes(asset.kind));
  }

  /** Upload a file; the asset (new, or the one that already holds these bytes) */
  async upload(bookId: string, file: File): Promise<Asset> {
    this.uploading = [...this.uploading, file.name];
    this.error = null;
    try {
      const asset = await uploadAsset(bookId, file);
      this.assets = [asset, ...this.assets.filter(a => a.id !== asset.id)];
      return asset;
    } catch (e) {
      this.error = e instanceof ApiError ? `${file.name}: ${e.message}` : String(e);
      throw e;
    } finally {
      this.uploading = this.uploading.filter(name => name !== file.name);
    }
  }

  /** A new version of an asset; every use in the book now names it (the draft changed: reload the content) */
  async replace(bookId: string, assetId: string, file: File): Promise<Asset> {
    this.uploading = [...this.uploading, file.name];
    this.error = null;
    try {
      const { asset } = await replaceAsset(bookId, assetId, file);
      this.assets = this.assets.map(a => (a.id === asset.id ? asset : a));
      return asset;
    } catch (e) {
      this.error = e instanceof ApiError ? `${file.name}: ${e.message}` : String(e);
      throw e;
    } finally {
      this.uploading = this.uploading.filter(name => name !== file.name);
    }
  }

  /** Remove an asset; refused while used unless forced (the API answers 409 asset-in-use with the usages) */
  async remove(bookId: string, assetId: string, force = false): Promise<void> {
    this.error = null;
    await deleteAsset(bookId, assetId, force);
    this.assets = this.assets.filter(a => a.id !== assetId);
  }

  /** The number of uses changed (a save): read the list again without a loading state */
  async refresh(): Promise<void> {
    if (!this.bookId) return;
    try {
      this.assets = (await listAssets(this.bookId)).assets;
    } catch {
      // the next load tells
    }
  }
}

export const library = new Library();
