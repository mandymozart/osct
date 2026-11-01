import { type ArStatus, Pages } from "@/types";

/**
 * When `<new-version-notice>` shows (#231): only when the page runs out-of-date code (`UpdateService`), the reader has
 * not hidden it, and at a calm moment – never while the camera or AR runs. Calm are the start and the consultation
 * pages (entries, entry, Info) and the overlays (error, not found); the scan view only once AR has failed (its chunk
 * did not load, the camera did not start), so a failed AR chunk is answered by the notice instead of a dead camera view.
 * The onboarding (tutorial) plays without it.
 *
 * The same notice carries the hint that the book uses features this app version does not know yet (#220, RULES #10:
 * content of a newer MINOR loads without them) – once per book version, at the same calm moments, with *Reload* when a
 * new version is also ready. The hint goes first: it says what an update brings.
 */

/** What the notice decides from */
export interface NoticeState {
  /** A new version took over, or a code file of the running one could not be loaded */
  outdated: boolean;
  /** The reader hid it (*Later*) */
  dismissed: boolean;
  /** The open page (`currentRoute.page`) */
  page: Pages | null;
  /** The AR scene's status (`arStatus`) */
  arStatus: ArStatus;
}

/** The AR scene is loading, starting the camera or running */
const AR_BUSY: ReadonlySet<ArStatus> = new Set<ArStatus>(["loading", "starting", "running"]);

/** Nothing runs the reader would be interrupted in: no camera, no AR, no onboarding */
export const isCalmMoment = (page: Pages | null, arStatus: ArStatus): boolean => {
  if (!page || AR_BUSY.has(arStatus)) return false;
  if (page === Pages.SPREAD) return arStatus === "error";
  return page !== Pages.TUTORIAL;
};

/** The notice is shown */
export const showNewVersionNotice = ({ outdated, dismissed, page, arStatus }: NoticeState): boolean =>
  outdated && !dismissed && isCalmMoment(page, arStatus);

/** What the notice says: the new version, or the hint about the book's newer features */
export type NoticeMessage = "update" | "newer-content";

/** The notice's state with the hint: `newerContent` = the book has skipped features and the hint was not closed for its version */
export interface NoticeWithHintState extends NoticeState {
  newerContent: boolean;
}

/** What the notice shows now, or null – the hint before the new version, either only at a calm moment */
export const noticeMessage = (state: NoticeWithHintState): NoticeMessage | null => {
  if (state.newerContent && isCalmMoment(state.page, state.arStatus)) return "newer-content";
  return showNewVersionNotice(state) ? "update" : null;
};
