// Placeholder UI sounds for the app (Tilman 2026-09-26, second take): contemporary, smooth, calm – like a
// meditation / mindfulness app. Soft sine tones and singing-bowl partials in D major pentatonic, gentle
// attacks, a quiet echo and a reverb on every sound. Replace the files in client/public/assets/sounds/
// with designed sounds of the same names whenever they exist.
//
//   node scripts/tools/generate-sounds.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 32000; // mono, enough for soft tones – keeps the files small (loaded after the first tap)
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/public/assets/sounds");

const note = name => {
  const [, letter, sharp, octave] = /^([A-G])(#?)(\d)$/.exec(name);
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[letter] + (sharp ? 1 : 0) + (Number(octave) - 4) * 12;
  return 440 * 2 ** (semis / 12);
};

const samples = seconds => new Float32Array(Math.round(RATE * seconds));

/** Add `src` into `out` starting at `atSeconds` */
const place = (out, src, atSeconds = 0) => {
  const offset = Math.round(RATE * atSeconds);
  for (let i = 0; i < src.length && offset + i < out.length; i++) out[offset + i] += src[i];
  return out;
};

/**
 * A soft voice: sine partials (ratio to `freq`, relative gain, decay time in s), a smooth attack
 * (raised cosine) and exponential decay. `detune` adds a second, slightly detuned copy of each partial –
 * the slow beating that makes bowls "breathe". `drop`: short pitch glide down at the start (wood / drop).
 */
const voice = ({ freq, seconds, gain = 0.3, attack = 0.01, partials = [[1, 1, 1]], detune = 0, drop = 0 }) => {
  const out = samples(seconds);
  const attackN = Math.max(1, Math.round(RATE * attack));
  for (const [ratio, level, decay] of partials) {
    const copies = detune ? [1 - detune / 2, 1 + detune / 2] : [1];
    for (const d of copies) {
      let phase = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        const f = freq * ratio * d * (1 + drop * Math.exp(-t * 60));
        phase += (2 * Math.PI * f) / RATE;
        const env = (i < attackN ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attackN) : 1) * Math.exp(-t / decay);
        out[i] += (Math.sin(phase) * level * gain * env) / copies.length;
      }
    }
  }
  return out;
};

/** Singing-bowl partials (inharmonic, the higher ones fade sooner) */
const BOWL = [[1, 1, 1.8], [2.71, 0.45, 1.1], [5.15, 0.2, 0.6], [8.4, 0.08, 0.35]];
/** Soft glass chime: a clear fundamental, a gentle shimmer above */
const CHIME = [[1, 1, 0.9], [3, 0.18, 0.4], [4.2, 0.07, 0.25]];

/** Feedback echo, mixed in at `mix` */
const delay = (input, { time = 0.23, feedback = 0.35, mix = 0.3, tail = 1 }) => {
  const out = new Float32Array(input.length + Math.round(RATE * tail));
  out.set(input);
  const d = Math.round(RATE * time);
  const echo = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const back = i - d >= 0 ? echo[i - d] : 0;
    echo[i] = (i < input.length ? input[i] : 0) + back * feedback;
    if (i >= d) out[i] += back * mix;
  }
  return out;
};

/**
 * Reverb (Schroeder / Freeverb style): parallel damped comb filters into series all-passes, mixed in
 * at `mix`. `size` scales the room, `damping` softens the highs of the tail.
 */
const reverb = (input, { size = 1, damping = 0.35, feedback = 0.8, mix = 0.3, tail = 1.8 }) => {
  const length = input.length + Math.round(RATE * tail);
  const dry = new Float32Array(length);
  dry.set(input);
  const scale = (RATE / 44100) * size;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map(n => Math.round(n * scale));
  const wet = new Float32Array(length);
  for (const n of combs) {
    const buf = new Float32Array(n);
    let idx = 0;
    let store = 0;
    for (let i = 0; i < length; i++) {
      const out = buf[idx];
      store = out * (1 - damping) + store * damping;
      buf[idx] = dry[i] + store * feedback;
      idx = (idx + 1) % n;
      wet[i] += out / combs.length;
    }
  }
  for (const n of [556, 441, 341].map(v => Math.round(v * scale))) {
    const buf = new Float32Array(n);
    let idx = 0;
    for (let i = 0; i < length; i++) {
      const b = buf[idx];
      const x = wet[i];
      wet[i] = -x + b;
      buf[idx] = x + b * 0.5;
      idx = (idx + 1) % n;
    }
  }
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = dry[i] + wet[i] * mix;
  return out;
};

/** Trim the silent end, fade out the last bit, scale to `peak` */
const finish = (input, peak = 0.6) => {
  let end = input.length;
  while (end > 1 && Math.abs(input[end - 1]) < 0.0004) end--;
  const out = input.slice(0, end);
  const fade = Math.min(out.length, Math.round(RATE * 0.08));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  const max = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  for (let i = 0; i < out.length; i++) out[i] *= peak / max;
  return out;
};

const wav = data => {
  const pcm = Buffer.alloc(data.length * 2);
  data.forEach((s, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

const sounds = {
  // Slider notch: a tiny, soft drop of water – many in a row must not tire (small room, no echo)
  tick: finish(
    reverb(voice({ freq: note("A6"), seconds: 0.09, gain: 0.25, attack: 0.002, partials: [[1, 1, 0.025]], drop: 0.35 }),
      { size: 0.5, mix: 0.18, tail: 0.25 }),
    0.35,
  ),

  // Button: a soft wooden "tok" with a hint of chime, a short room
  tap: finish(
    reverb(
      place(
        voice({ freq: note("D6"), seconds: 0.25, gain: 0.3, attack: 0.003, partials: [[1, 1, 0.07], [2.4, 0.25, 0.03]], drop: 0.2 }),
        voice({ freq: note("A6"), seconds: 0.4, gain: 0.08, attack: 0.004, partials: CHIME }),
      ),
      { size: 0.7, mix: 0.25, tail: 0.5 },
    ),
    0.5,
  ),

  // Target found (every find after the unlock): two glass chimes rising a fourth, a soft echo, a room
  found: finish(
    reverb(
      delay(
        place(
          place(samples(1.2), voice({ freq: note("A5"), seconds: 1.0, gain: 0.3, attack: 0.006, partials: CHIME })),
          voice({ freq: note("D6"), seconds: 1.1, gain: 0.3, attack: 0.006, partials: CHIME }),
          0.12,
        ),
        { time: 0.24, feedback: 0.3, mix: 0.28, tail: 0.8 },
      ),
      { size: 1.1, mix: 0.35, tail: 1.6 },
    ),
    0.55,
  ),

  // New entry unlocked (first find): a singing bowl opens, a slow chime arpeggio rises over it, then the
  // hall lets it breathe out
  unlock: finish(
    reverb(
      delay(
        ["D5", "F#5", "A5", "D6"].reduce(
          (out, n, i) => place(out, voice({ freq: note(n), seconds: 1.6, gain: 0.22, attack: 0.012, partials: CHIME }), 0.18 + i * 0.16),
          place(samples(2.6), voice({ freq: note("D4"), seconds: 2.6, gain: 0.35, attack: 0.03, partials: BOWL, detune: 0.004 })),
        ),
        { time: 0.32, feedback: 0.35, mix: 0.25, tail: 1.2 },
      ),
      { size: 1.4, damping: 0.4, feedback: 0.84, mix: 0.4, tail: 2.4 },
    ),
    0.6,
  ),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, data] of Object.entries(sounds)) {
  const file = path.join(OUT, `${name}.wav`);
  fs.writeFileSync(file, wav(data));
  console.log(`${name}.wav  ${Math.round((data.length / RATE) * 1000)} ms  ${Math.round(fs.statSync(file).size / 1024)} KB`);
}
