import type { BookData } from "@shared/types/game-config";
import { TEXT_MAX_LENGTH } from "@shared/api/rules";

/**
 * The book's texts (#223): its title, author and publisher (`PUT /editor/books/{id}`) – what a save sends and what
 * keeps Save off. Pure: `BookTexts.svelte` holds the draft and draws it. The onboarding is the reader's own (#236).
 */

export interface BookDraft {
  title: string;
  author: string;
  publisher: string;
}

export const bookDraftOf = (book: Pick<BookData, "title" | "author" | "publisher">): BookDraft => ({
  title: book.title,
  author: book.author,
  publisher: book.publisher ?? "",
});

/** A save's body: the fields that differ; an emptied publisher is `null` (removed) */
export const bookChanges = (book: Pick<BookData, "title" | "author" | "publisher">, draft: BookDraft): Record<string, string | null> => {
  const changes: Record<string, string | null> = {};
  if (draft.title.trim() !== book.title) changes.title = draft.title.trim();
  if (draft.author.trim() !== book.author) changes.author = draft.author.trim();
  if (draft.publisher.trim() !== (book.publisher ?? "")) changes.publisher = draft.publisher.trim() || null;
  return changes;
};

export const bookProblems = (draft: BookDraft): string[] => [
  ...(!draft.title.trim() ? ["The title is empty."] : []),
  ...(!draft.author.trim() ? ["The author is empty."] : []),
  ...(Object.entries(draft).some(([, value]) => value.trim().length > TEXT_MAX_LENGTH) ? [`A text is longer than ${TEXT_MAX_LENGTH} characters.`] : []),
];
