/**
 * The demo book's speaking video (`fixtures/demo/entries/screen/screen.mp4`) and its subtitle files
 * (`screen.<language>.vtt`): a few spoken lines with the sound in the file, the picture a row of bars that follow its
 * loudness, and the
 * same lines as WebVTT in English, German, French and Dutch – the cue times are the times the lines were laid at, so
 * the subtitles fit by construction.
 *
 *     node editor/tools/narration-video.mjs [out folder]
 *
 * Needs Windows (its speech synthesis reads the lines, through PowerShell) and ffmpeg on the PATH. The voice differs
 * between machines, so the files are not rebuilt by a test – run it again only to change the lines.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(process.argv[2] ?? fileURLToPath(new URL("../../fixtures/demo/entries/screen/", import.meta.url)));
const NAME = "screen";
const VOICE = "Microsoft David Desktop";

/** The spoken lines (English) and what the subtitles say in the other languages */
const LINES = [
  {
    en: "Hello. I am a video, standing on a sheet of paper.",
    de: "Hallo. Ich bin ein Video auf einem Blatt Papier.",
    fr: "Bonjour. Je suis une vidéo, posée sur une feuille de papier.",
    nl: "Hallo. Ik ben een video, op een vel papier.",
  },
  {
    en: "My sound is part of the file.",
    de: "Mein Ton steckt in der Datei.",
    fr: "Mon son fait partie du fichier.",
    nl: "Mijn geluid zit in het bestand.",
  },
  {
    en: "What I say shows as a line of text, in your language.",
    de: "Was ich sage, erscheint als Textzeile – in deiner Sprache.",
    fr: "Ce que je dis s'affiche en une ligne de texte, dans ta langue.",
    nl: "Wat ik zeg verschijnt als een regel tekst, in jouw taal.",
  },
  {
    en: "You can turn the subtitles off in the settings.",
    de: "Die Untertitel kannst du in den Einstellungen ausschalten.",
    fr: "Tu peux désactiver les sous-titres dans les réglages.",
    nl: "Je kunt de ondertitels uitzetten in de instellingen.",
  },
];

/** Seconds: before the first line, between two lines, after the last (the video loops) */
const LEAD = 0.5;
const GAP = 0.45;
const TAIL = 1.6;
/** A cue stays this long after its line ends, never into the next */
const LINGER = 0.25;

/** The picture: drawn at half size (the encoder doubles it), frames per second, the bars and their colours (r, g, b) */
const WIDTH = 284;
const HEIGHT = 160;
const FPS = 25;
const BARS = 44;
const BAR_STEP = 6;
const BAR_GAP = 2;
const BACKGROUND = [16, 16, 16];
const GOLD = [243, 204, 148];

/** The samples of a 16-bit mono PCM .wav file */
const pcm = file => {
  let at = 12;
  let rate = 0;
  while (at + 8 <= file.length) {
    const id = file.toString("latin1", at, at + 4);
    const size = file.readUInt32LE(at + 4);
    if (id === "fmt ") {
      if (file.readUInt16LE(at + 8) !== 1 || file.readUInt16LE(at + 10) !== 1 || file.readUInt16LE(at + 22) !== 16) throw new Error("expected 16-bit mono PCM");
      rate = file.readUInt32LE(at + 12);
    }
    if (id === "data") {
      const end = Math.min(file.length, at + 8 + size);
      const samples = new Int16Array((end - at - 8) >> 1);
      for (let i = 0; i < samples.length; i++) samples[i] = file.readInt16LE(at + 8 + i * 2);
      return { samples, rate };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error("no sound in the .wav file");
};

/** 16-bit mono PCM samples as a .wav file */
const wav = (samples, rate) => {
  const file = Buffer.alloc(44 + samples.length * 2);
  file.write("RIFF", 0, "latin1");
  file.writeUInt32LE(36 + samples.length * 2, 4);
  file.write("WAVEfmt ", 8, "latin1");
  file.writeUInt32LE(16, 16);
  file.writeUInt16LE(1, 20);
  file.writeUInt16LE(1, 22);
  file.writeUInt32LE(rate, 24);
  file.writeUInt32LE(rate * 2, 28);
  file.writeUInt16LE(2, 32);
  file.writeUInt16LE(16, 34);
  file.write("data", 36, "latin1");
  file.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) => file.writeInt16LE(sample, 44 + i * 2));
  return file;
};

const work = mkdtempSync(join(tmpdir(), "narration-"));
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

try {
  // 1. Each line as its own sound file, so its length is known
  const waves = LINES.map((line, i) => {
    const file = join(work, `line-${i}.wav`);
    const script = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      `$s.SelectVoice('${VOICE}')`,
      "$s.Rate = 2",
      `$s.SetOutputToWaveFile('${file.replace(/'/g, "''")}')`,
      `$s.Speak('${line.en.replace(/'/g, "''")}')`,
      "$s.Dispose()",
    ].join("; ");
    run("powershell.exe", ["-NoProfile", "-Command", script]);
    const { samples, rate } = pcm(readFileSync(file));
    return { samples, rate, duration: samples.length / rate };
  });

  // 2. Where each line starts
  let at = LEAD;
  const cues = waves.map(({ duration }) => {
    const start = at;
    at += duration + GAP;
    return { start, spoken: start + duration };
  });
  const total = Math.ceil((at - GAP + TAIL) * FPS) / FPS;
  cues.forEach((cue, i) => (cue.end = Math.min(cue.spoken + LINGER, cues[i + 1]?.start ?? total)));

  // 3. The sound: one track, the lines laid at their times
  const rate = waves[0].rate;
  const track = new Int16Array(Math.round(total * rate));
  waves.forEach(({ samples }, i) => track.set(samples.subarray(0, track.length - Math.round(cues[i].start * rate)), Math.round(cues[i].start * rate)));
  const sound = join(work, "track.wav");
  writeFileSync(sound, wav(track, rate));

  // 4. The picture: a row of bars, each the loudness of one frame – the newest on the right
  const perFrame = rate / FPS;
  const levels = Array.from({ length: Math.round(total * FPS) }, (_, frame) => {
    const from = Math.round(frame * perFrame);
    const to = Math.min(track.length, Math.round((frame + 1) * perFrame));
    let sum = 0;
    for (let i = from; i < to; i++) sum += (track[i] / 32768) ** 2;
    return Math.min(1, Math.sqrt(Math.sqrt(sum / Math.max(1, to - from)) * 3));
  });
  const frames = Buffer.alloc(levels.length * WIDTH * HEIGHT * 3);
  for (let i = 0; i < frames.length; i += 3) frames.set(BACKGROUND, i);
  const left = Math.round((WIDTH - (BARS * BAR_STEP - BAR_GAP)) / 2);
  levels.forEach((_, frame) => {
    for (let bar = 0; bar < BARS; bar++) {
      const level = levels[frame - (BARS - 1 - bar)] ?? 0;
      const half = Math.max(1, Math.round((level * (HEIGHT - 24)) / 2));
      for (let y = HEIGHT / 2 - half; y < HEIGHT / 2 + half; y++) {
        for (let x = left + bar * BAR_STEP; x < left + bar * BAR_STEP + BAR_STEP - BAR_GAP; x++) {
          frames.set(GOLD, ((frame * HEIGHT + y) * WIDTH + x) * 3);
        }
      }
    }
  });
  const picture = join(work, "frames.rgb");
  writeFileSync(picture, frames);

  // 5. The video
  run("ffmpeg", [
    "-v", "error", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${WIDTH}x${HEIGHT}`, "-r", String(FPS), "-i", picture,
    "-i", sound,
    "-vf", `scale=${WIDTH * 2}:${HEIGHT * 2}:flags=neighbor`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-profile:v", "main", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "48k", "-ac", "1",
    "-shortest", "-movflags", "+faststart", "-map_metadata", "-1", "-fflags", "+bitexact",
    join(OUT, `${NAME}.mp4`),
  ]);

  // 6. The subtitle files: one per language, the same times
  const stamp = seconds => {
    const ms = Math.round(seconds * 1000);
    const pad = (n, width = 2) => String(n).padStart(width, "0");
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
  };
  Object.keys(LINES[0]).forEach(language => {
    const body = cues.map((cue, i) => `${i + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${LINES[i][language]}\n`).join("\n");
    writeFileSync(join(OUT, `${NAME}.${language}.vtt`), `WEBVTT\n\n${body}`);
  });

  console.log(`${NAME}.mp4 (${total} s) and ${Object.keys(LINES[0]).length} subtitle files → ${OUT}`);
  cues.forEach((cue, i) => console.log(`  ${stamp(cue.start)} → ${stamp(cue.end)}  ${LINES[i].en}`));
} finally {
  rmSync(work, { recursive: true, force: true });
}
