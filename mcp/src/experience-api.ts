// TODO #320 B1: the names and shapes shared/api/editor.ts takes in B1 (agents/REFACTOR-EXPERIENCE.md §2). B1 renames them
// there; until both branches meet they are spelled here from the old ones. The integration merge deletes this file and
// the tools import them from "../../shared/api/editor" like the rest.
import type {
  BookAppearanceSaved as B1AppearanceSaved,
  BookPassesSaved as B1PassesSaved,
  BookSummary as B1Summary,
  BookTree as B1Tree,
  EnvironmentServing as B1Serving,
  ImportComparison as B1Comparison,
  ImportPreview as B1Preview,
  ImportResult as B1Imported,
  IncomingBuild as B1Incoming,
  OtherBook as B1Other,
  PublishResult as B1Published,
  RemovalImpact as B1Impact,
} from "../../shared/api/editor";
import type { ExperienceData } from "../../shared/types/game-config";

/** `book` (the experience's id or summary) named `experience` – each member of a union */
type B1Named<T, V> = T extends unknown ? Omit<T, "book"> & { experience: V } : never;

export type ExperienceSummary = Omit<B1Summary, "author" | "book"> & { experience: ExperienceData };
export type ExperienceTree = B1Named<B1Tree, ExperienceSummary>;
export type EnvironmentServing = B1Named<Extract<B1Serving, { book: unknown }>, string | null> | Exclude<B1Serving, { book: unknown }>;
export type ExperienceList = { experiences: ExperienceSummary[]; environments: EnvironmentServing[] };
/** `PUT /editor/experiences/{id}` { title?, book? } – `book: null` removes the printed book, a new one needs `author` */
export interface ExperienceUpdate {
  title?: string;
  book?: { author?: string; publisher?: string | null } | null;
}
export type ExperienceSaved = { experience: ExperienceData };
export type ExperiencePassesSaved = B1PassesSaved;
export type ExperienceAppearanceSaved = B1AppearanceSaved;
export type OtherExperience = B1Named<B1Other, string | null>;
export type PublishResult = Omit<B1Published, "replaced"> & { replaced: { experience: string | null; build: string | null } | null };
export type IncomingBuild = B1Named<B1Incoming, string>;
export type ImportComparison = Omit<B1Named<B1Comparison, { id: string; title: string }>, "incoming"> & { incoming: IncomingBuild };
export type ImportPreview = Omit<B1Preview, "incoming" | "existing"> & { incoming: IncomingBuild; existing: ImportComparison | null };
export type ImportResult = B1Named<B1Imported, ExperienceSummary>;
export type RemovalImpact = B1Named<B1Impact, string>;
