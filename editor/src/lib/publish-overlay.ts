import type { LiveIn, PublishJob } from "./api";

/**
 * What the Publish overlay says (#345, Tilman 2026-11-22: "this first dropdown dialog should be much more on point … a
 * little log hidden behind a details expandable"): one centered overlay with three states – **confirm** (what readers get,
 * when it was published last, a warning only when it matters), **running** (live for readers yet, the archive's count) and
 * **done** (what was written) – and a small log behind *Details* with what used to be on the step: the build, the build it
 * replaces, the carried plugins, skipped files, errors. Pure: the component (`PublishButton.svelte`) only renders it.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A moment in local time, as near as it is: `today 07:53`, `yesterday 18:10`, `20 Nov 07:53`, `20 Nov 2025 07:53` */
export const whenText = (iso: string, now: Date = new Date()): string => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (sameDay(at, now)) return `today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(at, yesterday)) return `yesterday ${time}`;
  const day = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
  return at.getFullYear() === now.getFullYear() ? `${day} ${time}` : `${day} ${at.getFullYear()} ${time}`;
};

/** A log line's time: `07:53:03` (local) */
export const stamp = (at: Date): string => `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Confirm ─────────────────────────────────────────────────────────────────────────────────────────

export interface ConfirmInput {
  title: string;
  env: string;
  /** The experience on the target: undefined – not published there; "unreadable" – its store cannot be read */
  live: LiveIn | "unreadable" | undefined;
  /** The draft's build now (null: not known) */
  build: string | null;
  /** The Code tab's saved sources the publish carries */
  plugins: number;
  /** What stops the publish (a plugin that does not compile), null when nothing does */
  problem: string | null;
}

export interface ConfirmView {
  /** `Publish “Test Experience” to staging?` */
  heading: string;
  /** What it means for readers */
  readers: string;
  /** `Last published: today 07:53`, or that it is not published there yet */
  last: string;
  /** The one danger line, null when nothing matters */
  problem: string | null;
}

/** The confirm state, `now` for the relative time */
export const confirmView = (input: ConfirmInput, now: Date = new Date()): ConfirmView => {
  const { title, env, live, build, plugins, problem } = input;
  const last = live === "unreadable"
    ? `What ${env} serves now cannot be read.`
    : !live
      ? `Not published on ${env} yet.`
      : `Last published: ${live.since ? whenText(live.since, now) : "time unknown"}${live.build && live.build === build && !plugins ? ` – ${env} has this state already.` : ""}`;
  return {
    heading: `Publish “${title}” to ${env}?`,
    readers: env === "production" ? "Every reader gets this state on their next start." : "Readers get this state.",
    last,
    problem,
  };
};

// ── Running ─────────────────────────────────────────────────────────────────────────────────────────

export interface RunningView {
  heading: string;
  /** `Live for readers ✓` once latest.json names the build, before that `Writing the build…` */
  live: string;
  /** The export archive's count, null while there is none (the bar is indeterminate) */
  archive: { done: number; total: number } | null;
  /** `Archive 412 / 1522` */
  label: string | null;
}

/** The export archive's files written or found of its total: from the job's parts, else the job's whole count */
export const archiveCount = (job: PublishJob): { done: number; total: number } | null => {
  if (!job.live) return null;
  if (job.parts) {
    const offset = job.parts.build + 2;
    return { done: Math.min(job.parts.archive, Math.max(0, job.done - offset)), total: job.parts.archive };
  }
  return job.total ? { done: job.done, total: job.total } : null;
};

/** The running state for the job as the last poll reported it (null: the start has not answered yet) */
export const runningView = (job: PublishJob | null): RunningView => {
  const archive = job ? archiveCount(job) : null;
  return {
    heading: "Publishing…",
    live: job?.live ? "Live for readers ✓" : "Writing the build…",
    archive,
    label: archive ? `Archive ${archive.done} / ${archive.total}` : null,
  };
};

// ── Done, failed, unknown ───────────────────────────────────────────────────────────────────────────

export interface EndView {
  heading: string;
  summary: string;
  /** A danger line besides (the export archive did not get written) */
  warning: string | null;
}

/** Files the publish wrote, files the store held already – null without a job's counts */
export const writtenCounts = (job: PublishJob | null): { written: number; skipped: number } | null =>
  job ? { written: Math.max(0, job.done - job.skipped), skipped: job.skipped } : null;

/** The done state: `Live on staging. 3 files new, 1527 were already there.` */
export const doneView = (env: string, job: PublishJob | null, exportError?: string): EndView => {
  const counts = writtenCounts(job);
  return {
    heading: "Published",
    summary: counts
      ? `Live on ${env}. ${plural(counts.written, "file")} new, ${counts.skipped} ${counts.skipped === 1 ? "was" : "were"} already there.`
      : `Live on ${env}.`,
    warning: exportError ? `The export archive was not written: ${exportError}` : null,
  };
};

export const failedView = (message: string): EndView => ({ heading: "Publish failed", summary: message, warning: null });

export const unknownView = (message: string): EndView => ({ heading: "Publish outcome unknown", summary: message, warning: null });

// ── The log behind Details ──────────────────────────────────────────────────────────────────────────

export interface LogLine {
  /** `07:53:03` */
  at: string;
  text: string;
}

export interface StartContext {
  env: string;
  /** `staging · CDN` */
  target: string;
  /** The draft's build now */
  build: string | null;
  live: LiveIn | "unreadable" | undefined;
  plugins: number;
  /** The directory store is the target: what that means (`EnvironmentInfo.warning`) */
  warning?: string | null;
}

/** What the log starts with when Publish is clicked: the target, the build it replaces there, the carried plugins */
export const startLog = (context: StartContext): string[] => {
  const { env, target, build, live, plugins, warning } = context;
  const lines = [`publish to ${target}${build && !plugins ? ` – draft build ${build}` : ""}`];
  lines.push(live === "unreadable" ? `what ${env} serves now cannot be read` : live?.build ? `replaces build ${live.build}` : `not published on ${env} yet`);
  if (plugins) lines.push(`${plural(plugins, "plugin")} transpiled, not type-checked – the build gets its name when it is published`);
  if (warning) lines.push(warning);
  return lines;
};

/** What changed between two states of the job (`previous` null: the first the editor learns), as log lines */
export const jobLog = (previous: PublishJob | null, job: PublishJob): string[] => {
  const lines: string[] = [];
  if (!previous || previous.id !== job.id) lines.push(`build ${job.build} – ${plural(job.total, "file")} to write or find`);
  const wasPastVersion = previous && previous.id === job.id && previous.phase !== "version";
  if (!wasPastVersion && job.phase !== "version") {
    const files = job.parts?.build;
    lines.push(`build written${files ? ` (${plural(files, "file")})` : ""}`);
  }
  if (job.live && !(previous?.id === job.id && previous.live)) lines.push(`live on ${job.env}`);
  if (job.skipped > (previous?.id === job.id ? previous.skipped : 0)) lines.push(`${plural(job.skipped, "file")} already on the store, not written again`);
  const archive = archiveCount(job);
  const before = previous?.id === job.id ? archiveCount(previous) : null;
  if (archive && job.status === "running" && archive.done !== before?.done) lines.push(`archive ${archive.done}/${archive.total}`);
  if (job.status === "done" && previous?.status !== "done") {
    const exported = job.result?.export;
    lines.push(exported?.error ? `export archive not written: ${exported.error}` : exported?.written ? "export archive written" : "export archive was there already");
    lines.push(`done – build ${job.build} on ${job.env}`);
  }
  if (job.status === "failed" && previous?.status !== "failed") lines.push(`failed: ${job.error ? `${job.error.message} (${job.error.code})` : "no reason given"}`);
  return lines;
};

/** Lines stamped with one time */
export const stamped = (texts: string[], at: Date): LogLine[] => texts.map(text => ({ at: stamp(at), text }));
