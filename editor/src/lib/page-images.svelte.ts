import { errorText, getPages, putPageImages, type BookPage, type PageImage, type PageImageChange } from "./api";
import { pageKey } from "@shared/api/page-names";

/**
 * The book's pages and page images (#251, docs/editor.md "Pages"): loaded per book, kept in step after a save. A page
 * image is a Library image that the stage and the spread cards show instead of the print layout's half for its page –
 * an editor-only override, never content. `byKey` is what the stage and the cards read (page key → URL).
 */
class PageImages {
  bookId = $state<string | null>(null);
  pages = $state<BookPage[]>([]);
  images = $state<PageImage[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  /** Page key (`12`, `-3`, `1f`) → the image's URL */
  get byKey(): Record<string, string> {
    return Object.fromEntries(this.images.map(image => [pageKey(image), image.url]));
  }

  /** The image of a page, undefined without one */
  of(page: { page: number; facing?: boolean }): PageImage | undefined {
    const key = pageKey(page);
    return this.images.find(image => pageKey(image) === key);
  }

  async load(bookId: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const list = await getPages(bookId);
      this.pages = list.pages;
      this.images = list.pageImages;
      this.bookId = bookId;
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.loading = false;
    }
  }

  /** One batch of changes – all or nothing; the images as the API has them afterwards */
  async save(bookId: string, items: PageImageChange[]): Promise<void> {
    this.error = null;
    try {
      this.images = (await putPageImages(bookId, items)).pageImages;
    } catch (e) {
      this.error = errorText(e);
      throw e;
    }
  }
}

export const pageImages = new PageImages();
