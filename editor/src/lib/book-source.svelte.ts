import { sourceOfTruthOf, type SourceOfTruth } from "@shared/types/game-config";
import { getBook, putBookTexts } from "./api";

/**
 * The open book's source of truth (#238, `book.sourceOfTruth`): print first – the spreads are the printed book's, from
 * an import of its layout – or digital first – spreads are added and removed in the editor. The book's Inspector sets
 * it (`PUT /editor/books/{id}`); the workspace, the tree and the book page show the spread controls only while it is
 * digital. One book at a time.
 */
class BookSource {
  bookId = $state<string | null>(null);
  value = $state<SourceOfTruth>("print");

  get digital(): boolean {
    return this.value === "digital";
  }

  /** Read the book's setting (its tree, shared with the other readers of `getBook`) */
  async load(bookId: string): Promise<void> {
    const tree = await getBook(bookId);
    this.bookId = bookId;
    this.value = sourceOfTruthOf(tree.book.book);
  }

  /** Change it in the draft; the answer's book is the truth */
  async set(bookId: string, value: SourceOfTruth): Promise<void> {
    const { book } = await putBookTexts(bookId, { sourceOfTruth: value });
    this.bookId = bookId;
    this.value = sourceOfTruthOf(book);
  }
}

export const bookSource = new BookSource();
