import type { PublishJob, PublishResult, PublishStarted } from "@shared/api/editor";

/**
 * The Publish dialog's way through a publish job (#345, docs/server.md "Publish jobs"): `POST …/publish` answers the outcome
 * when the server wrote everything within its step, else 202 `{ job }` – then the dialog polls `GET …/publish/{job}`
 * (each poll may write the next part on the server) and shows done / total until the job is done or failed. A gateway
 * that gives up on the POST (502/503/504 without the API's answer, or no answer at all) does not mean the publish failed:
 * the newest job of the experience (`GET …/publish`) that was not there before the click is this publish, and the dialog
 * follows it. Only when no such job turns up is the outcome unknown – said as such, never as a failure.
 */

/** How a publish ended for the dialog */
export type PublishOutcome =
  | { kind: "done"; result: PublishResult; job: PublishJob | null }
  | { kind: "failed"; message: string; job: PublishJob | null }
  | { kind: "unknown"; message: string; job: PublishJob | null };

/** An error as the API client throws it (`ApiError`: status, code, details), or anything else */
interface ErrorLike {
  status?: number;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface PublishCalls {
  /** POST …/publish */
  start: () => Promise<PublishStarted>;
  /** GET …/publish/{job} */
  poll: (jobId: string) => Promise<{ job: PublishJob }>;
  /** GET …/publish – the experience's newest job */
  latest: () => Promise<{ job: PublishJob | null }>;
  /** Every state of the job the dialog learns */
  progress: (job: PublishJob) => void;
  /** Waits between polls (tests pass one that does not) */
  wait?: (ms: number) => Promise<void>;
}

/** Between two polls */
export const POLL_MS = 1500;
/** Polls in a row that may fail (a gateway, the network) before the dialog says it lost the publish – about a minute */
export const POLL_FAILURES = 40;
/** Looks for the job of a POST whose answer was lost (the request may still be checking the draft) */
const LOOKUPS = 5;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const errorLike = (error: unknown): ErrorLike => (typeof error === "object" && error !== null ? error as ErrorLike : {});

/** A failed request whose answer did not come from the API: no answer, or a gateway's 502/503/504 page (no error code) */
export const isLostAnswer = (error: unknown): boolean => {
  const { status, code } = errorLike(error);
  if (status === undefined) return error instanceof TypeError || (error instanceof Error && /fetch|network/i.test(error.message));
  return [502, 503, 504].includes(status) && (code === undefined || code === "unknown");
};

const messageOf = (error: unknown): string => {
  const { code, message } = errorLike(error);
  if (message && code && code !== "unknown") return `${message} (${code})`;
  return message ?? String(error);
};

const outcomeOf = (job: PublishJob): PublishOutcome =>
  job.status === "done" && job.result
    ? { kind: "done", result: job.result, job }
    : { kind: "failed", message: job.error ? `${job.error.message} (${job.error.code})` : "The publish failed.", job };

/**
 * Runs a publish to its end: started, followed while it runs, its outcome. `before` = the id of the experience's newest
 * job before the click (null: none, undefined: not known) – how a job whose start answer was lost is told from an older one.
 */
export const runPublish = async (calls: PublishCalls, before: string | null | undefined): Promise<PublishOutcome> => {
  const wait = calls.wait ?? sleep;
  let job: PublishJob | null = null;
  try {
    const started = await calls.start();
    if ("build" in started) {
      const { job: startedJob, ...answer } = started;
      return { kind: "done", result: answer, job: startedJob };
    }
    job = started.job;
  } catch (error) {
    const { status, code, details } = errorLike(error);
    if (status === 409 && code === "publish-running" && details?.job) {
      // Another publish of the experience runs (another tab, a click before): follow it instead
      job = details.job as PublishJob;
    } else if (isLostAnswer(error)) {
      job = await findStarted(calls, before, wait);
      if (!job) {
        return {
          kind: "unknown", job: null,
          message: `The server did not answer (${status ?? "no answer"}) and no publish of this experience was found – check the live build before publishing again.`,
        };
      }
    } else {
      return { kind: "failed", message: messageOf(error), job: null };
    }
  }
  calls.progress(job);
  let failures = 0;
  while (job.status === "running") {
    await wait(POLL_MS);
    try {
      job = (await calls.poll(job.id)).job;
      failures = 0;
      calls.progress(job);
    } catch (error) {
      if (!isLostAnswer(error) || ++failures >= POLL_FAILURES) {
        return {
          kind: "unknown", job,
          message: `Lost contact with the publish (${messageOf(error)}) – it may still be running on the server. Open Publish again to see how it ended.`,
        };
      }
    }
  }
  return outcomeOf(job);
};

/** The job a lost POST started: the experience's newest job when it is another than `before` */
const findStarted = async (calls: PublishCalls, before: string | null | undefined, wait: (ms: number) => Promise<void>): Promise<PublishJob | null> => {
  if (before === undefined) return null;
  for (let i = 0; i < LOOKUPS; i++) {
    await wait(POLL_MS * 2);
    try {
      const { job } = await calls.latest();
      if (job && job.id !== before) return job;
    } catch {
      // the next try
    }
  }
  return null;
};
