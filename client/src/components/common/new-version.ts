import { type ArStatus, Pages } from "@/types";

/**
 * When `<new-version-notice>` shows (#231): only when the page runs out-of-date code (`UpdateService`), the reader has
 * not hidden it, and at a calm moment – never while the camera or AR runs. Calm are the start and the consultation
 * pages (entries, entry, Info) and the overlays (error, not found); the scan view only once AR has failed (its chunk
 * did not load, the camera did not start), so a failed AR chunk is answered by the notice instead of a dead camera view.
 * The onboarding (tutorial) plays without it.
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
