import type { ExperienceData } from "@shared/types/game-config";
import { TEXT_MAX_LENGTH } from "@shared/api/rules";

/**
 * The experience's texts (#223, #320): its title and – when it accompanies a printed book – the book's author and
 * publisher (`PUT /editor/experiences/{id}`) – what a save sends and what keeps it back. Pure: `ExperienceTexts.svelte`
 * holds the draft and draws it. Removing the printed book is a step of its own (`book: null`, confirmed in the panel),
 * never a side effect of a save here. The onboarding is the reader's own (#236).
 */

export interface ExperienceDraft {
  title: string;
  /** The "Printed book" switch: on – the experience accompanies a printed book with this author and publisher */
  book: boolean;
  author: string;
  publisher: string;
}

type Texts = Pick<ExperienceData, "title" | "book">;

export const experienceDraftOf = (experience: Texts): ExperienceDraft => ({
  title: experience.title,
  book: !!experience.book,
  author: experience.book?.author ?? "",
  publisher: experience.book?.publisher ?? "",
});

/** A save's body – what the API's `PUT /editor/experiences/{id}` takes */
export interface ExperienceChanges {
  title?: string;
  book?: { author?: string; publisher?: string | null };
}

/**
 * A save's body: the fields that differ. While the switch is on, a book the draft does not hold yet goes whole
 * (`author`, and `publisher` when given); one it holds sends only what changed – an emptied publisher is `null`
 * (removed). While it is off nothing about the book is sent: the panel removes a saved book in its own step.
 */
export const experienceChanges = (experience: Texts, draft: ExperienceDraft): ExperienceChanges => {
  const changes: ExperienceChanges = {};
  if (draft.title.trim() !== experience.title) changes.title = draft.title.trim();
  if (!draft.book) return changes;
  const author = draft.author.trim();
  const publisher = draft.publisher.trim();
  const saved = experience.book;
  if (!saved) {
    changes.book = { author, ...(publisher ? { publisher } : {}) };
    return changes;
  }
  const book: NonNullable<ExperienceChanges["book"]> = {};
  if (author !== saved.author) book.author = author;
  if (publisher !== (saved.publisher ?? "")) book.publisher = publisher || null;
  if (Object.keys(book).length) changes.book = book;
  return changes;
};

export const experienceProblems = (draft: ExperienceDraft): string[] => [
  ...(!draft.title.trim() ? ["The title is empty."] : []),
  ...(draft.book && !draft.author.trim() ? ["The printed book's author is empty."] : []),
  ...([draft.title, draft.author, draft.publisher].some(value => value.trim().length > TEXT_MAX_LENGTH) ? [`A text is longer than ${TEXT_MAX_LENGTH} characters.`] : []),
];
