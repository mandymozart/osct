// Placeholder UI sounds for the app (Tilman 2026-09-26: "think towards Nintendo games") – original
// chiptune blips: square / pulse waves with short envelopes. Replace the files in
// client/public/assets/sounds/ with designed sounds of the same names whenever they exist.
//
//   node scripts/tools/generate-sounds.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22050;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/public/assets/sounds");

const note = name => {
  const [, letter, sharp, octave] = /^([A-G])(#?)(\d)$/.exec(name);
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[letter] + (sharp ? 1 : 0) + (Number(octave) - 4) * 12;
  return 440 * 2 ** (semis / 12);
};

/**
 * One tone: pulse wave (duty 0.5 = square, 0.25 / 0.125 = thinner NES-like), attack + exponential decay,
 * optional vibrato, pitch slide to `slideTo` (Hz).
 */
const tone = ({ freq, ms, duty = 0.5, volume = 0.3, decay = 6, attackMs = 2, slideTo, vibrato = 0 }) => {
  const n = Math.round((RATE * ms) / 1000);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = (slideTo ? freq + (slideTo - freq) * t : freq) * (1 + vibrato * Math.sin((2 * Math.PI * 6 * i) / RATE));
    phase = (phase + f / RATE) % 1;
    const attack = Math.min(1, i / ((RATE * attackMs) / 1000));
    out[i] = (phase < duty ? 1 : -1) * volume * attack * Math.exp(-decay * t);
  }
  return out;
};

const silence = ms => new Float32Array(Math.round((RATE * ms) / 1000));

/** Sequence with overlap-free concatenation, then a short fade-out against clicks */
const sequence = (...parts) => {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  const fade = Math.min(out.length, Math.round(RATE * 0.004));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
};

/** Two layers played together (e.g. melody + an octave echo) */
const mix = (a, b) => {
  const out = new Float32Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
};

const wav = samples => {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
};

const sounds = {
  // Slider notch: a tiny, high, thin click – many in a row must not tire
  tick: sequence(tone({ freq: note("E6"), ms: 22, duty: 0.125, volume: 0.18, decay: 9 })),

  // Button: menu "select" blip, two quick rising notes
  tap: sequence(
    tone({ freq: note("A5"), ms: 32, duty: 0.25, volume: 0.22, decay: 3 }),
    tone({ freq: note("E6"), ms: 55, duty: 0.25, volume: 0.22, decay: 5 }),
  ),

  // Target found (again): short rising "ping" with a pitch slide
  found: sequence(
    tone({ freq: note("C6"), ms: 45, duty: 0.25, volume: 0.22, decay: 2 }),
    tone({ freq: note("G6"), ms: 120, duty: 0.25, volume: 0.22, decay: 5, slideTo: note("G6") * 1.01, vibrato: 0.006 }),
  ),

  // New entry unlocked: fast rising arpeggio, then a held note with vibrato and an octave sparkle
  unlock: mix(
    sequence(
      ...["G5", "B5", "D6", "G6"].map(n => tone({ freq: note(n), ms: 55, duty: 0.5, volume: 0.2, decay: 1.5 })),
      silence(20),
      tone({ freq: note("B6"), ms: 380, duty: 0.5, volume: 0.2, decay: 4, vibrato: 0.01 }),
    ),
    sequence(
      silence(240),
      ...["G6", "D7", "G7"].map(n => tone({ freq: note(n), ms: 60, duty: 0.125, volume: 0.07, decay: 3 })),
    ),
  ),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
  const file = path.join(OUT, `${name}.wav`);
  fs.writeFileSync(file, wav(samples));
  console.log(`${name}.wav  ${Math.round((samples.length / RATE) * 1000)} ms  ${fs.statSync(file).size} bytes`);
}
