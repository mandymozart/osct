Status 2026-11-25: concept (the epic links here; PLAN.md Phase 8 points to it). No code changed. Read from OSCT at
ab33c089 (6.22.0) and samarecordings' `theme/sama/assets/js/motion.js` + `sound-panel.js` (2026-11-25). §8 holds the
decisions for Tilman.

# Sound design – a modular sound engine for OSCT, from samarecordings' engine

The ask (Tilman, 2026-11-25): *"i want to apply the sound design engine i made for samarecordings into our osct editor"* –
*"we do have sounds, but i want a more modular approach"* – *"so events get triggered, and we can use hooks or direct
events send to a sound module or slot or something. then there needs to be a base sound engine and then there needs to
be plugins for special synths. same as our other plugins"*.

## 0 · In short

1. **Today OSCT has four fixed sounds.** `client/src/services/FeedbackService.ts` plays
   `assets/sounds/{tick,tap,found,unlock}.wav` and a vibration per event; volumes, cooldowns and patterns are constants
   in the code. An author can neither change nor add a sound.
2. **The shape** – three layers, each replaceable:
   - **Events** – what happens: the bus the engine already has (core events `targetFound …`, scene events, plugins'
     events), plus the reader's UI moments emitted onto it (`tap`, `tick`, `entryOpen` …).
   - **Slots** – where a sound plays: a named mixer channel that **listens to** events (the hook) or is played
     **directly** (`sound.play("found")` from the reader, a rule's `{ sound: "found" }`, a plugin's `api.sound.play`).
     A slot has its preset, volume, mute, cooldown and vibration.
   - **Presets on the base engine** – a source → FX chain → master, with one LFO. The **base sound engine** owns the
     audio context, slots, the chain, the LFO, the sample player and two plain synths; **special synths are plugins**,
     registered as every other plugin kind: `api.registerSynth(name, SPEC, factory)`.
3. samarecordings' synths (FM, pluck, grain, wind/noise colours) become the **first synth plugin**, shipped as a
   first-party plugin of the demo/osct experiences – the proof that the seam works.
4. The four WAV files stay – as the default slots' **sample presets** – so a book without sound data sounds as today
   (nothing removed, RULES #1).
5. The editor gets a **Sound panel** (slots mixer + preset editor) whose synth rows come from the synth's spec, exactly as a
   component's or a material's parameters do today.

## 1 · What exists

### OSCT
| Piece | Where | What it does |
|---|---|---|
| UI / AR feedback | `client/src/services/FeedbackService.ts` | events `tick tap found unlock`; Web Audio buffers from WAV; vibration; cooldown (found 4 s per target); settings *Sound* / *Vibration*, Info → Settings |
| Media sound | `engine/src/scene/media.ts` | videos with sound where the browser allows; `setMediaSound` = the reader's Sound switch |
| Audio assets | `ASSET_TYPES` (`shared/types/game-config.ts`) | `audio` asset type with quality levels (#331); plugins can load one (`assetType: "audio"` → `HTMLAudioElement`) |
| Event bus | `engine/src/scene/plugin-runtime.ts`, `shared/types/behaviour.ts` | core events (scene only), scene events (anyone), `api.events.on/emit`; rules listen to events and run `play pause stop show hide set emit goto` |
| Plugin kinds | plugin API | `registerComponent / Layer / Pass / NodeType / Material / Texture / Appearance / CardLook` – a name, a SPEC (parameters with `kind`, label, range), a factory |
| Logic canvas | `editor/src/lib/logic/signals.ts` | an `audio` signal colour already exists |
| Plan | PLAN Phase 8, #301 | final sounds as a file swap; sounds compressed / in levels |

### samarecordings
- **Preset** = synth + knobs (pitch, length, volume, tone, shape, glitch; a sample: start, length, attack, release,
  semitones, pan) → drive → filter (+ envelope) → ping-pong delay → reverb → master; one LFO (sine, triangle, square,
  random; rate, fade, retrigger) with routes onto any knob.
- **Mixer**: event → preset, volume (0–150 %), mute. Synths `noise sine fm pluck grain wind sample`, all in one file.
- **Lifecycle** worth keeping: no AudioContext while sound is off; context only while a sound plays (+ tail), then
  `suspend()`; reverb impulses and drive curves cached; samples fetched on the first gesture, skipped if not ready in
  150 ms; touch devices skip hover sounds; a continuous source runs only while it is needed.
- **Panel**: events list (preset, ▶, ↺, M), preset in signal-flow order, LFO scope, L/R meter, A/B (saved vs. edits),
  WAV/AIFF/FLAC → MP3 in the browser, a sample's selection cut into its own snippet on save.

## 2 · Events → slots → presets

```
 events (the bus)                     slots (mixer)                      presets (base engine + synth plugins)
 targetFound ───listens──▶  found   ─ volume, mute, cooldown, haptic ─▶  "Pew"   = sample(found.wav) → filter → reverb
 tap (reader UI) ─listens─▶  tap    ─────────────────────────────────▶  "Blip"  = osc(sine)        → delay
 any rule  { sound: "unlock" } ────▶  unlock ────────────────────────▶  "Jingle"= fm (plugin synth) → delay → reverb
 a plugin  api.sound.play("hum")  ─▶  hum (loop) ────────────────────▶  "Hum"   = grain (plugin synth), LFO → cutoff
```

- **Hook**: a slot's `listens: ["targetFound"]` – the base engine subscribes on the bus; a payload filter
  (`{ target: "…" }`) narrows it, as a rule's `when` does.
- **Direct**: `sound.play(slot, { key, volume, pan })` – the reader's `feedback(…)` call sites, a rule's new action
  `{ sound: <slot> }` (behaviour action, schema MINOR), `api.sound.play / stop` in plugin code.
- A slot is one-shot or **continuous** (`loop: true`: plays from `play` until `stop`, or while a listened state holds –
  ambience, a hum near a target).
- The reader's UI moments become bus events the reader emits (`ui.tap`, `ui.tick`, `ui.entryOpen` …), so a slot
  or a rule can listen to them like to any other event – no second event system.

### Two homes for slots (Tilman, 2026-11-25: *"some stuff is part of the 2d app … those are on the experience level and
then we got in place on targets"*)

| Home | What | Listens to | Plays |
|---|---|---|---|
| **Experience** (`experience.sound`) | the 2D app's sounds – buttons, slider, entry open/close, unlock jingle, scene change; a session-wide ambience | `ui.*` events, core events of any target (`targetFound` …), named events | stereo, non-spatial, across scene switches |
| **Target** (`target.sound`) | sounds **in place** – a hum on a page, a creak when this picture is found, a loop while it is in view | the target's own `found lost tap unlocked` (as a node's rules), named events | **at the target, in stereo**: pan from where the target sits left/right of the camera, volume from its distance, optionally duller with distance – updated from the AR frame; stops when the target's scene goes |

- A target slot is the same `SoundSlot` with `place: "target"` implied; presets are shared – a target names an
  experience preset (`preset: "hum"`) or carries its own.
- Priority: a target slot that listens to `found` plays **instead of** the experience slot `found` for that target when it
  says `replaces: "found"` – so one page can have its own find sound without a rule.
- **Stereo, with basic spatialisation** (Tilman, 2026-11-25: *"we go for stereo. but spatialisation basics are needed"*):
  no 3D / HRTF panner. A target slot's `space: { pan, distance, rolloff, muffle }` – `pan` 0–1 how far the target's
  horizontal position (camera space, −1…1) moves the `StereoPannerNode`; `distance` the reference distance in m where the
  volume is full; `rolloff` how fast it falls beyond (inverse, as Web Audio's); `muffle` 0–1 a low-pass that closes with
  distance. Smoothed (`setTargetAtTime`, ~50 ms) so tracking jitter never clicks; a lost target fades out over the
  slot's release. The math is pure (`engine/src/audio/space.ts`, tested), the AR frame only feeds it the anchor.
- **3D with HRTF** (Tilman, 2026-11-25: *"since our phone has a position towards the target. can we build on some
  ambisonics for spatialisation?"* – then *"3D/HRTF is maybe better for our purpose"*): yes. The anchor gives the full
  pose of the camera relative to every found target, so Web Audio's own 3D panning fits: the **listener** is the camera
  (position + forward/up from the pose, each AR frame), each target slot a **`PannerNode`** at its target's anchor (plus
  an offset in the target's plane, `space.at`). Two modes per slot:
  1. **Stereo** (base): pan / distance / muffle as above – cheap, right for phone speakers.
  2. **3D** (`space.mode: "3d"`): `PannerNode` with `panningModel "HRTF"` when the reader says *Headphones (3D sound)*
     (a setting under Sound, off by default – headphones cannot be detected reliably), else `"equalpower"` (the same
     positions, rendered as stereo – HRTF filtering sounds odd on a phone's speaker). Distance from the panner's own
     model (`inverse`, `refDistance` = `space.distance`, `rolloffFactor` = `space.rolloff`); `muffle` stays our low-pass;
     an optional cone (`coneInnerAngle` …) so a sound faces out of the page.
  - Why not ambisonics first: OSCT has few point sources at a time (the engine tracks 4 targets), each on a page – an
    HRTF panner per source is built into every browser, needs no dependency and no decode stage. Ambisonics pays off for
    **recorded sound fields** (AmbiX ambience that stays put while the phone turns) and many sources – kept as a later
    option (Omnitone, Apache-2.0), not in this epic.
  - Positions are smoothed (`setTargetAtTime` / `linearRampToValueAtTime`, ~50 ms) so tracking jitter never zips;
    the listener updates only while a 3D slot plays. A lost target fades its slot out over the release (no reference).
  - Risk: HRTF costs a convolution per source – fine for ≤ 4 – and Safari's `PannerNode` HRTF is older but present;
    phone test with headphones in T11.
- Later (not this epic): a slot on an entity (a node inside the target's tree) – the same thing with the node's position.

## 2b · One mixer for everything that sounds – video, voice, slots

Tilman, 2026-11-25: *"where is overlaps of this with our audio engine for video playbacks and voice overs. or are they
just on a separate track? can we somehow find a common solution that will help performance and audio mixing?"*

**Today they are separate tracks.** A video node's sound (narration included – #257: the voice is in the video) plays
through the `<video>` element's own output (`engine/src/scene/media.ts`: muted / silenced / tap to restore); the UI sounds
through `FeedbackService`'s own `AudioContext`. Nothing knows the other: a find jingle plays at full level over a voice,
two contexts run on iOS, and a video at a target cannot be placed in space.

**Proposal: one `AudioContext`, one mixer, four buses** (the engine's `SoundEngine` owns it; the reader and the editor's
stage hand it nothing but settings):

```
 ui slots ──────────────▶ [UI bus]     ─┐
 sound slots (exp+target)▶ [Sounds bus] ─┤  (ducked by Voice)
 video nodes ───────────▶ [Media bus]  ─┼─▶ master ─▶ limiter (DynamicsCompressor) ─▶ out
 voice videos ──────────▶ [Voice bus]  ─┘
```

- **Videos join through `createMediaElementSource(video)`** – possible because the engine already loads every video with
  `crossOrigin = "anonymous"` (`scene/textures.ts`, `scene/assets.ts`; a WebGL video texture needs it anyway). The element
  keeps decoding and the autoplay rules (`media.ts` stays the one place for play / muted / silenced); its sound now goes
  through a gain and, at a target, through the same **space** as a target slot (stereo or 3D) – a video on a page sounds
  from the page.
- **Voice** = a video node marked `voice: true` (or every video with subtitles – D10). While a voice speaks, the Sounds
  and Media buses **duck** (`mix.duck: { amount: −9 dB, attack 0.08 s, release 0.6 s }`) – gain automation on the bus,
  no analyser needed because the engine knows when the voice plays (play / pause / ended events). The UI bus is not
  ducked (taps stay audible) but a slot can say `duck: true`.
- **Bus levels** in the content: `experience.sound.mix: { ui, sounds, media, voice }` (0–1), set in the Sound panel's
  head beside Master; later possibly the reader's own sliders (Info → Sound).
- **Limiter** on the master: several targets with video + an unlock jingle no longer clip; one node for all.

**Performance**
- One context instead of two (FeedbackService's + the slots'): iOS allows few; one unlock gesture for all, one
  `suspend()` when nothing sounds – a playing video keeps it running, which costs nothing extra (the element would
  output audio anyway).
- Ducking by gain automation, not by analysing the signal: no `AnalyserNode` in the reader (only the editor's meter).
- 3D for videos is the same `PannerNode` as for slots – ≤ 4 targets in view, so ≤ 4 HRTF convolutions in the worst case.
- Element-routed media cannot be pre-decoded – they stream as today; only short slots' samples are decoded buffers.

**Risks to test on the phones (T12)**
- iOS Safari: a `MediaElementSource` follows the context's state – a suspended context silences the video; the context
  must resume with the first tap (the same gesture `media.ts` already waits for). Older iOS had a bug where routed
  media went silent after a page hide; test resume after background.
- A media element routed once can never be unrouted: the engine routes it on creation and keeps it (entities dispose
  what they create – the source node goes with the element).
- The editor's stage (Live off: no sound, #275) uses the same mixer with the master at 0.

## 2c · Library: presets and samples

Tilman, 2026-11-25: *"presets we need to save to the library as well as samples. and we need to convert samples from wav
to mp3 into our quality resolutions."*

**Presets are Library items** – a new Library kind `sound` (`ASSET_KINDS` in `shared/api/rules.ts`, beside `shader`,
`subtitles`, `hdri`): one JSON file per preset (`<name>.sound.json`, a `SoundPreset`), uploaded, renamed, credited,
deleted and found by usage like every other Library item. A slot names a preset by its Library id
(`slot.preset: "hum"`); the content build reads the used presets into the configuration
(`experience.sound.presets`, so the reader loads no extra files and the content schema change stays a MINOR – no new
`ASSET_TYPES` value). The Sound panel's *Presets* section is a filtered view of the Library (kind `sound`); *Save as
preset* from a slot's inline edit writes a new Library item. A preset can be copied to another experience the way
other Library items are (import/export, #346).

**Samples are `audio` assets with levels** (#331: `MEDIA_LEVELS.audio = [64, 128, 192]` kbps; the decision of #331 that
the browser makes the levels of light media applies – *"images and maps (and light audio) in the browser"*):
- Upload WAV / AIFF / FLAC (or MP3 / M4A) in the Library or from a slot's Source → the browser decodes it
  (`decodeAudioData`; AIFF parsed by hand as in samarecordings) and encodes **MP3 at 64, 128 and 192 kbps** (lamejs,
  loaded only then; 44.1 kHz; mono stays mono at half the rate); the three files are uploaded as the asset's
  `levels`, the highest as `src`. The reader picks the level as for every levelled medium (`media-levels.ts`).
- Length cap for samples 60 s (longer audio is music → a video/media question, not a slot).
- The original file: kept in the Library as the asset's source (not published) so levels can be made again – D13.
- A slot's **selection** (start / length) plays from the level file; cutting the selection into its own short file (as
  samarecordings does on save) is an optimisation for the release step (#304), not needed for the first version.
- **MP3, not Opus/AAC** for samples: `decodeAudioData` reads MP3 on every target browser incl. older iOS, and lamejs
  encodes it in the browser; #301's Opus/AAC plan concerns the app's own UI sounds and long media – D12 aligns them.

## 3 · Model (contract, `shared/types/sound.ts`)

```ts
interface SoundData {                         // ExperienceData.sound and TargetData.sound
  mix?: { ui?; sounds?; media?; voice?; duck?: { amount; attack; release } };   // experience only (§2b) – optional, schema MINOR
                                              // (a target's: slots only, presets optional – it may name the experience's)
  master?: number;                            // 0–1
  slots: Record<string, SoundSlot>;           // slot name (camelCase) → slot
  presets: Record<string, SoundPreset>;       // built from the Library's `sound` items the slots use (§2c)
}
interface SoundSlot {
  preset: string;
  listens?: (string | { event: string; where?: Record<string, BehaviourValue> })[];   // the hook
  volume?: number; muted?: boolean; loop?: boolean;
  cooldown?: number;                          // ms, per key (found: per target)
  haptic?: number | number[];                 // vibration pattern, same row
}
interface SoundPreset {
  name?: string;
  source: { synth: string; params?: Record<string, unknown>; asset?: string };  // synth: built-in or a plugin's
  filter?: { enabled?: boolean; drive; cutoff; resonance; envelope; decay };
  delay?:  { enabled?: boolean; time; feedback; mix; width };
  reverb?: { enabled?: boolean; size; mix; width };
  lfo?:    { enabled?: boolean; shape; rate; fade; amount; retrigger; routes: { knob; depth; phase?; offset? }[] };
}
```
- Words, not sama's short keys (`cutoff`, not `cut`): the editor's rows and the MCP read them (RULES #32).
- Each FX stage is a toggled group (`enabled`) – off keeps its values (RULES #32 "a section with a toggle").
- The FX chain's knobs (range, default, log) live once in `SOUND_KNOBS` (shared). A synth's own knobs come from **its
  spec** (`source.params`), checked like a component's params – an unknown param or synth is skipped with a warning
  (RULES #10 MINOR), the build and the editor's API stay strict.
- No `sound` → the built-in default: slots `tick tap found unlock` with today's volumes, cooldown and vibration, each
  a sample preset of its WAV.

## 4 · Base engine and synth plugins (`engine/src/audio/`, three-free)

**Base** (in the engine, always there):
- `sound-engine.ts` – `SoundEngine`: context lifecycle (lazy, unlock on a gesture, suspend after the tail; none while
  sound is off), master bus, slots (bus subscriptions, cooldowns, continuous slots), `play / stop`.
- `chain.ts` – drive → filter (+ envelope) → ping-pong delay → reverb (cached impulses), per voice.
- `lfo.ts` – shapes, routes, smoothing (pure math – tested without Web Audio).
- Built-in synths: `sample` (an audio asset: start, length, attack, release, semitones, pan – through `contentUrl` and
  its quality level, #331/#301) and `oscillator` (sine / triangle / square / saw / noise; pitch, length, envelope). Enough
  for every UI sound; anything more is a plugin.
- The engine knows no store, settings storage or i18n (RULES #32): the host passes `soundOn()` and the haptics hook.

**Synth plugins** – a new plugin kind, as every other one:
```ts
api.registerSynth("fm", SPEC, ({ params, audio, time, destination, preset }) => ({
  start(): void,                  // build nodes into `destination`, schedule from `time`
  stop?(at: number): void,        // continuous synths
  pitched?: AudioParam[],         // what the LFO's pitch route moves (sama's `tune()`)
}));
```
- `SPEC` = the usual parameter spec (`kind: "number"` with min / max / log, `choice` …): the editor draws the synth's
  rows from it, the guard checks `source.params` against the recorded spec, the LFO can route to any number param.
- The plugin gets the `AudioContext` and a destination, never the master or another slot – a plugin's voice is disposed
  when it ends or when the plugin is uninstalled (the editor's Run), as feedback buffers are (`feedback.ts`).
- Also on the API: `api.sound.play(slot, opts)` / `api.sound.stop(slot)` – plugin code triggers slots directly.
- First plugin: **sama synths** – `fm`, `pluck` (Karplus), `grain`, `wind`, the noise colours – ported from
  `motion.js` with its tuned defaults. A later seam, not in this epic: `registerSoundEffect` (an FX stage as a plugin).

## 5 · Reader

- `FeedbackService` keeps the settings, the gesture unlock and the click listener; its `play(event, key)` becomes
  `emit("ui.<event>")` + the engine's slot machinery; vibration moves into the slot (`haptic`).
- The Sound switch stays the one switch (media + feedback).
- iOS: Web Audio follows the silent switch – Phase 8's open item stays open.

## 6 · Editor – the Sound panel

- Where: the experience's sheet, beside Appearance / Environment / Passes (`panels/SoundPanel.svelte`).
- **Slots** (compact first, as in sama): one row per slot – name, preset chip, volume `<scrub-number>`, mute toggle, ▶,
  closed it shows what it listens to. Open: listens (events picked from the bus vocabulary the Logic view already knows,
  `uses`), cooldown, loop, vibration.
- **Preset**: Source (synth picker: built-ins + every registered synth plugin; its rows from the spec) → Filter → Delay
  → Reverb → Out, each a `Section` with a toggle in its head; LFO section with routes (swept range on the knob). ▶ Play,
  ⧉ copy, delete.
- Editor dogma, not sama's look: monochrome (RULES #38), `<scrub-number>`, help in the Info view, **autosave** (RULES #37 –
  sama's A/B becomes *Undo edits* + an A/B play toggle against the saved version).
- The Logic canvas shows slots as nodes with the `audio` signal: events wire into a slot (= `listens`), a rule's
  `sound` action wires out of it – the same data as the panel, two views.
- API: `PUT /api/editor/experiences/<id>/sound`; MCP `get_sound` / `put_sound`.
- Design before build: concept layouts with Tilman's corrections first.

## 7 · Out of scope here

A slot on an entity (a node inside a target's tree), scene-level slot overrides, FX plugins, the asset pipeline's audio
conversion and cutting (#301 / #304). (Target slots, in place, **are** in scope – §2 "Two homes".)

## 8 · Decisions for Tilman

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | Where the engine lives | (a) TS port in OSCT's engine; (b) a package shared with samarecordings | **(a)** – samarecordings is a WordPress theme without a build; share later through the XR core (`2026-11-20-shared-xr-core.md`) |
| D2 | What the base ships | (a) sample + oscillator, the rest plugins; (b) all sama synths built in | **(a)** – your "base engine + plugins for special synths" |
| D3 | The four WAV files | (a) default sample presets; (b) replaced | **(a)** – nothing removed, you retune or swap |
| D4 | Reader UI moments on the bus | today's 4 + a list | the 4 + `entryOpen`, `entryClose`, `sceneChange`, `cardFlip` – with the designers (Phase 8) |
| D5 | Vibration in the slot | yes / stays in code | **yes** – one row per moment |
| D6 | Homes | experience + target (Tilman's message) / + scene, + entity | **experience + target now**; scene and entity later |
| D7 | A target's find sound | `replaces: "found"` on the target slot / only through a rule | **`replaces`** – no rule needed for the common case |
| D9 | 3D rendering | (a) `PannerNode` HRTF per source (headphones) / equalpower (speakers); (b) ambisonics (FOA bus, Omnitone) | **(a)** – Tilman's lean; ambisonics later for AmbiX recordings |
| D10 | Which videos are a voice | `voice: true` on the video node / every video with subtitles | **`voice: true`**, defaulting to on for a video with subtitles |
| D11 | Videos through the mixer | yes (one context, buses, ducking, space) / keep them apart | **yes** – after a phone test (T12) |
| D12 | Sample format | MP3 levels in the browser (lamejs) / Opus+AAC (#301) | **MP3** for samples now; #301 follows it for the UI sounds |
| D13 | Keep the original WAV | in the Library as the source, never published / discard after encoding | **keep** – levels can be remade, a better encoder later |
| D8 | Priority | now / after #322 and the logic follow-ups (HANDOFF "Next") | your call – it completes Phase 8 |

## 9 · Plan (the epic's tasks)

| T | Task | Size | Depends on |
|---|---|---|---|
| T1 | Contract: `shared/types/sound.ts` (slots, presets, `SOUND_KNOBS`, guard, default), `ExperienceData.sound`, the `sound` behaviour action, schema MINOR, docs/content.md | M | D1–D5 |
| T2 | Base engine `engine/src/audio/`: lifecycle, slots (listens / direct / loop / cooldown), chain, LFO, `sample` + `oscillator`; tests of the pure parts | L | T1 |
| T3 | Plugin kind `registerSynth` + `api.sound.play/stop`, recorded specs, docs/plugins.md | M | T2 |
| T4 | First synth plugin: sama synths (fm, pluck, grain, wind, noise colours) | M | T3 |
| T5 | Reader: `FeedbackService` → bus + slots, WAVs as default presets, D4's moments emitted | M | T2, D4 |
| T6 | Editor concept layouts for the Sound panel (slots, preset, LFO, Logic node) – Tilman's corrections | M | T1 |
| T7 | Editor Sound panel + API route + autosave; the stage plays through the same engine | L | T2, T6 |
| T8 | Logic: slots as canvas nodes, the `sound` action wired | M | T7 |
| T9 | MCP `get_sound` / `put_sound`, `docs/sound.md` | S | T7 |
| T10 | Target slots in place: `TargetData.sound`, the engine's panner from the anchor, `replaces`, the target's Sound section in the editor | M | T2, T7 |

| T12 | One mixer: buses UI / Sounds / Media / Voice, limiter, videos through `createMediaElementSource` at their target's space, voice ducking, `mix` in the Sound panel; iPhone + S22 test (background/resume) | M | T2, D10, D11 |
| T13 | Library kind `sound` (presets as JSON items: API rules, Library view, usages, build into the configuration), *Save as preset* | M | T1 |
| T14 | Samples: WAV/AIFF/FLAC → MP3 64/128/192 kbps in the browser (lamejs, lazy), uploaded as `levels`, original kept; waveform with start/length in the Source | M | T13, D12, D13 |
| T11 | 3D mode: the listener from the camera pose, a `PannerNode` per target slot, HRTF / equalpower by the *Headphones* setting, cone; phone test with headphones | M | T10, D9 |

Order: T1 → T2 → (T3 → T4) ‖ T5 ‖ T6 ‖ T12 ‖ T13 → T14 → T7 → (T8 ‖ T9 ‖ T10) → T11. Drafts: `agents/design/sound-design.html`. T1 + T2 + T5 ship alone: the reader sounds as today, from data.
