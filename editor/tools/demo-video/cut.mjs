// Cuts the recorded scenes (record.mjs) into the demo video (README.md) with ffmpeg: each scene's frames, trimmed to
// the plan's [from, to] (seconds from the scene's first frame) and resampled to a constant 30 fps by their screencast
// timestamps, crossfaded into each other, encoded as H.264 for WhatsApp, e-mail and Instagram (no audio track).
//
//   node cut.mjs --format desktop|phone --in <recording dir> --out <file.mp4> [--crf 21] [--maxrate 3.6M] [--fade 7]
//
// The plan below is the cut: change the order or the trims and run it again (no new recording needed).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]);
    return pairs;
  }, []),
);
const format = args.format === "phone" ? "phone" : "desktop";
const input = join(args.in ?? "recording", format);
const output = args.out ?? `osct-wip-${format === "phone" ? "9x16" : "16x9"}.mp4`;
const [W, H] = format === "phone" ? [1080, 1920] : [1920, 1080];
const FPS = 30;
/** Crossfade length in frames (0 = hard cuts) */
const FADE = Number(args.fade ?? 7);
const crf = String(args.crf ?? 17);
const maxrate = args.maxrate ?? "3.6M";

/** The cut: scene, from, to (seconds from the scene's first frame) */
const PLAN = {
  desktop: [
    { scene: "books", from: 0, to: 5.25 },
    { scene: "orbit", from: 0.3, to: 3.6 },
    { scene: "select-drag", from: 0.2, to: 3.6 },
    { scene: "aquarium", from: 0.4, to: 3.7 },
    { scene: "library", from: 0.35, to: 4.6 },
    { scene: "bloom", from: 0.25, to: 3.9 },
    { scene: "environment", from: 0.3, to: 3.7 },
    { scene: "code", from: 0.9, to: 5.9 },
  ],
  phone: [
    { scene: "books", from: 0, to: 5.6 },
    { scene: "orbit", from: 0.3, to: 3.6 },
    { scene: "sheet-toolbar", from: 0.3, to: 5.1 },
    { scene: "select-drag", from: 0.2, to: 3.6 },
    { scene: "aquarium", from: 0.4, to: 3.7 },
    { scene: "library", from: 1.6, to: 5.4 },
    { scene: "bloom", from: 0.8, to: 4.2 },
    { scene: "environment", from: 0.6, to: 4.3 },
    // "code" is recorded too; the phone cut leaves it out to stay near 30 s (the 16:9 cut has it)
  ],
};
const plan = PLAN[format];

const work = join(input, "..", `cut-${format}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const ffmpeg = (list) => execFileSync("ffmpeg", ["-v", "error", "-y", ...list], { stdio: "inherit" });

// 1. Each scene → a clip at 30 fps (near-lossless intermediate)
const clips = [];
for (const [i, cut] of plan.entries()) {
  const dir = join(input, cut.scene);
  const { frames } = JSON.parse(readFileSync(join(dir, "frames.json"), "utf8"));
  const t0 = frames[0].t;
  const rel = frames.map((f) => ({ name: f.name, t: f.t - t0 }));
  // The frame showing at `from` (the last one before it), then every frame up to `to`
  let first = rel.findLastIndex((f) => f.t <= cut.from);
  if (first < 0) first = 0;
  const used = rel.slice(first).filter((f, k) => k === 0 || f.t < cut.to);
  let list = "";
  used.forEach((f, k) => {
    const start = Math.max(f.t, cut.from);
    const end = k + 1 < used.length ? used[k + 1].t : cut.to;
    list += `file '${join(dir, f.name).replace(/\\/g, "/")}'\nduration ${Math.max(0.001, end - start).toFixed(4)}\n`;
  });
  list += `file '${join(dir, used.at(-1).name).replace(/\\/g, "/")}'\n`;
  const listFile = join(work, `${i}-${cut.scene}.txt`);
  writeFileSync(listFile, list);
  const clip = join(work, `${i}-${cut.scene}.mp4`);
  const seconds = cut.to - cut.from;
  ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-vf", `fps=${FPS},scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p`,
    "-t", seconds.toFixed(3), "-c:v", "libx264", "-preset", "veryfast", "-crf", "10", "-an", clip]);
  clips.push({ clip, seconds, scene: cut.scene });
}

// 2. The clips one after another: crossfades of FADE frames (xfade), or hard cuts
const fade = FADE / FPS;
const inputs = clips.flatMap((c) => ["-i", c.clip]);
let filter = "";
let last = "[0:v]";
let offset = 0;
const timeline = [];
clips.forEach((c, i) => {
  timeline.push({ scene: c.scene, start: +(offset).toFixed(2), seconds: +c.seconds.toFixed(2) });
  if (i === 0) {
    offset = c.seconds;
    return;
  }
  const out = `[x${i}]`;
  if (FADE > 0) {
    offset -= fade;
    timeline.at(-1).start = +offset.toFixed(2);
    filter += `${last}[${i}:v]xfade=transition=fade:duration=${fade.toFixed(4)}:offset=${offset.toFixed(4)}${out};`;
  } else {
    filter += `${last}[${i}:v]concat=n=2:v=1:a=0${out};`;
  }
  offset += c.seconds;
  last = out;
});
const encode = ["-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-level:v", "4.1", "-crf", crf, "-maxrate", maxrate,
  "-bufsize", "7M", "-pix_fmt", "yuv420p", "-r", String(FPS), "-g", String(FPS * 2), "-movflags", "+faststart", "-an"];
// The end: a short fade to black (no end card – no text at all, Tilman #195)
const END_FADE = 0.4;
filter += `${last}fade=t=out:st=${(offset - END_FADE).toFixed(4)}:d=${END_FADE}[v]`;
ffmpeg([...inputs, "-filter_complex", filter, "-map", "[v]", ...encode, output]);

const size = statSync(output).size;
console.log(`${output}: ${offset.toFixed(2)} s, ${(size / 1024 / 1024).toFixed(2)} MB, ${W}×${H}`);
for (const t of timeline) console.log(`  ${t.start.toFixed(2).padStart(6)} s  ${t.scene} (${t.seconds} s)`);
writeFileSync(join(work, "timeline.json"), JSON.stringify(timeline, null, 1));
