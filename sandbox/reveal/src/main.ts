import { CONCEPTS, conceptDefaults, ENGINE_CONCEPT } from "./concepts";
import { ENGINE_DEFAULTS, startEngine } from "./engine-runner";
import { buildSection, type Controls, el } from "./panel";
import {
  DEFAULT_SCENE, ENGINE_PLACEMENT, ENGINE_SECTIONS, engineLook, type EngineParams, merged, PLACEMENT_SECTION, type PlacementParams, REVEAL_SECTIONS,
  type RevealParams, SCENE_SECTION, type SceneParams,
} from "./params";
import { type Runner, startReveal } from "./reveal";
import { Stage } from "./stage";

/**
 * The reveal sandbox: a model on a page under the reader's conditions (stage.ts), a concept to play on it – the
 * engine's own animation or one of the sandbox's – and a panel that tunes it while it plays. Everything tuned is kept
 * in this browser and can be copied as JSON.
 */

type Phase = "in" | "out";

interface Saved {
  concept: string;
  reveal: Record<string, RevealParams>;
  engine: EngineParams;
  /** The engine's default look when `engine` was saved: values tuned over another default are not kept */
  engineBase: string;
  scene: SceneParams;
  placements: Record<string, PlacementParams>;
  model: string;
  speed: number;
  loop: boolean;
  replay: boolean;
}

const STORE_KEY = "osct-reveal-sandbox";
const structured = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const ENGINE_BASE = JSON.stringify(ENGINE_DEFAULTS);

const load = (): Saved => {
  let saved: Partial<Saved> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
  } catch {
    // An unreadable state starts fresh
  }
  const reveal: Record<string, RevealParams> = {};
  CONCEPTS.filter(concept => concept.id !== ENGINE_CONCEPT)
    .forEach(concept => (reveal[concept.id] = merged(conceptDefaults(concept.id), saved.reveal?.[concept.id])));
  return {
    concept: CONCEPTS.some(concept => concept.id === saved.concept) ? saved.concept! : "inflate",
    reveal,
    engine: merged(structured(ENGINE_DEFAULTS), saved.engineBase === ENGINE_BASE ? saved.engine : null),
    engineBase: ENGINE_BASE,
    scene: merged(DEFAULT_SCENE, saved.scene),
    placements: typeof saved.placements === "object" && saved.placements ? saved.placements : {},
    model: typeof saved.model === "string" ? saved.model : "",
    speed: typeof saved.speed === "number" ? saved.speed : 1,
    loop: saved.loop === true,
    replay: saved.replay !== false,
  };
};

const state = load();
let storeTimer = 0;
const store = () => {
  window.clearTimeout(storeTimer);
  storeTimer = window.setTimeout(() => localStorage.setItem(STORE_KEY, JSON.stringify(state)), 200);
};

// ── Page ──

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = $("viewport");
const stage = new Stage($("stage"), state.scene);
const status = $("status");

let runner: Runner | null = null;
const player = { phase: "in" as Phase, tau: 1, playing: false, hold: 0, scrubbed: false };
/** Blob URLs of dropped files, by the name shown */
const dropped = new Map<string, string>();

const isEngine = () => state.concept === ENGINE_CONCEPT;
const conceptValues = (): object => (isEngine() ? state.engine : state.reveal[state.concept]);

const makeRunner = () => {
  runner?.dispose();
  runner = null;
  const entity = stage.instance?.object;
  if (!entity) return;
  runner = isEngine()
    ? startEngine(stage.anchor, entity, state.engine)
    : startReveal(stage.anchor, entity, state.reveal[state.concept], () => stage.bufferHeight);
};

const start = (phase: Phase) => {
  player.phase = phase;
  player.tau = 0;
  player.playing = true;
  player.hold = 0;
  player.scrubbed = false;
  runner?.invalidate();
};

// ── Transport ──

const scrub = $<HTMLInputElement>("scrub");
const readout = $("readout");
const loopBox = $<HTMLInputElement>("loop");
const replayBox = $<HTMLInputElement>("replay");
const speed = $<HTMLSelectElement>("speed");

$("found").addEventListener("click", () => start("in"));
$("lost").addEventListener("click", () => start("out"));
loopBox.checked = state.loop;
loopBox.addEventListener("change", () => {
  state.loop = loopBox.checked;
  if (state.loop && !player.playing) start(player.phase === "in" && player.tau >= 1 ? "out" : "in");
  store();
});
replayBox.checked = state.replay;
replayBox.addEventListener("change", () => {
  state.replay = replayBox.checked;
  store();
});
speed.value = String(state.speed);
speed.addEventListener("change", () => {
  state.speed = Number(speed.value);
  store();
});
scrub.addEventListener("input", () => {
  player.tau = Number(scrub.value);
  player.playing = false;
  player.hold = 0;
  player.scrubbed = true;
});
window.addEventListener("keydown", event => {
  if ((event.target as HTMLElement).closest("input, select, textarea, button")) return;
  if (event.code === "Space") {
    event.preventDefault();
    start(player.phase === "in" && player.tau > 0 ? (player.playing ? "in" : "out") : "in");
  }
});

stage.view.onFrame(delta => {
  if (!runner || !stage.instance) return;
  if (player.playing) {
    // As the engine: at most one 30 fps frame per step, so a stall never skips the animation
    player.tau = Math.min(1, player.tau + (Math.min(delta, 1 / 30) * 1000 * state.speed) / runner.duration(player.phase));
    if (player.tau >= 1) {
      player.playing = false;
      player.hold = state.loop ? (player.phase === "in" ? 0.9 : 0.5) : 0;
    }
  } else if (state.loop && player.hold > 0) {
    player.hold -= delta;
    if (player.hold <= 0) start(player.phase === "in" ? "out" : "in");
  }
  // Lost and dissolved: the anchor hides, as in the reader
  stage.instance.object.visible = !(player.phase === "out" && player.tau >= 1);
  runner.play(player.phase, player.tau);
  stage.view.bloomStrength = runner.bloom;
  if (document.activeElement !== scrub || player.playing) scrub.value = String(player.tau);
  const ms = runner.duration(player.phase);
  readout.textContent = `${player.phase === "in" ? "appear" : "disappear"} ${Math.round(player.tau * ms)} / ${Math.round(ms)} ms`;
});

// ── Panel ──

const conceptList = $("concepts");
const about = $("about");
const conceptControls = $("concept-controls");
const values = $<HTMLTextAreaElement>("values");
let sections: Controls[] = [];
let sectionsFor: "engine" | "reveal" | "" = "";
let replayTimer = 0;

/** The values to hand back: a sandbox concept's, or – for the engine – the look as an experience's content names it */
const showValues = () => {
  const { look, ...params } = state.engine;
  values.value = JSON.stringify(isEngine() ? { concept: state.concept, look: { type: look, ...params } } : { concept: state.concept, params: conceptValues() }, null, 2);
};

/** A value of the concept changed: a running animation follows; at rest it plays again, unless it was scrubbed */
const conceptChanged = (key?: string) => {
  // Another of the engine's looks: its values replace the panel's
  if (isEngine() && key === "look") {
    Object.assign(state.engine, engineLook(state.engine.look));
    sections.forEach(section => section.refresh());
  }
  runner?.invalidate();
  showValues();
  store();
  window.clearTimeout(replayTimer);
  if (state.replay && !player.playing && !player.scrubbed) replayTimer = window.setTimeout(() => start("in"), 250);
};

const showConcept = () => {
  conceptList.querySelectorAll("button").forEach(button => button.classList.toggle("on", button.dataset.id === state.concept));
  about.textContent = CONCEPTS.find(concept => concept.id === state.concept)?.about ?? "";
  const kind = isEngine() ? "engine" : "reveal";
  if (kind !== sectionsFor) {
    sectionsFor = kind;
    sections = (isEngine() ? ENGINE_SECTIONS : REVEAL_SECTIONS).map(section => buildSection(section, conceptValues(), conceptChanged));
    conceptControls.replaceChildren(...sections.map(section => section.element));
  } else {
    sections.forEach(section => section.refresh(conceptValues()));
  }
  showValues();
};

const selectConcept = (id: string) => {
  state.concept = id;
  showConcept();
  makeRunner();
  start("in");
  store();
};

CONCEPTS.forEach(concept => {
  const button = el("button", "", concept.name);
  button.type = "button";
  button.dataset.id = concept.id;
  button.title = concept.about;
  button.addEventListener("click", () => selectConcept(concept.id));
  conceptList.append(button);
});

$("reset").addEventListener("click", () => {
  if (isEngine()) state.engine = structured(ENGINE_DEFAULTS);
  else state.reveal[state.concept] = conceptDefaults(state.concept);
  showConcept();
  makeRunner();
  start("in");
  store();
});
$("copy").addEventListener("click", async () => {
  showValues();
  values.select();
  try {
    await navigator.clipboard.writeText(values.value);
    status.textContent = "Values copied";
  } catch {
    status.textContent = "Select the values and copy them";
  }
});
$("apply").addEventListener("click", () => {
  try {
    const pasted = JSON.parse(values.value) as { concept?: string; params?: unknown; look?: { type?: string } };
    // A look as the content names it: its type is the panel's look
    if (pasted.look) pasted.params = { ...pasted.look, look: pasted.look.type };
    const id = CONCEPTS.some(concept => concept.id === pasted.concept) ? pasted.concept! : state.concept;
    if (id === ENGINE_CONCEPT) state.engine = merged(structured(ENGINE_DEFAULTS), pasted.params);
    else state.reveal[id] = merged(conceptDefaults(id), pasted.params);
    status.textContent = "Values applied";
    selectConcept(id);
  } catch (error) {
    status.textContent = `Not JSON: ${(error as Error).message}`;
  }
});

// Placement and scene
const placement = (): PlacementParams => (state.placements[state.model] ??= { ...ENGINE_PLACEMENT });
const placed = () => {
  stage.place(placement());
  runner?.refit();
  store();
};
const placementControls = buildSection(PLACEMENT_SECTION, { ...ENGINE_PLACEMENT }, placed);
const placementButtons = el("div", "buttons");
const fit = el("button", "", "Fit to the target");
fit.type = "button";
fit.title = "Largest side one target width, centred, its base on the page – the rotation stays";
fit.addEventListener("click", () => {
  state.placements[state.model] = stage.fitted(placement());
  placementControls.refresh(placement());
  placed();
});
const engineDefault = el("button", "", "Engine default");
engineDefault.type = "button";
engineDefault.title = "A model's default in the content: standing on the page, scale 0.5";
engineDefault.addEventListener("click", () => {
  state.placements[state.model] = { ...ENGINE_PLACEMENT };
  placementControls.refresh(placement());
  placed();
});
placementButtons.append(fit, engineDefault);
placementControls.element.append(placementButtons);

const applyViewport = () => viewport.classList.toggle("fill", state.scene.viewport === "fill");
const sceneControls = buildSection(SCENE_SECTION, state.scene, () => {
  applyViewport();
  stage.applyScene();
  store();
});
stage.onOrbit = () => {
  sceneControls.refresh();
  store();
};
$("scene-controls").append(placementControls.element, sceneControls.element);
applyViewport();
stage.applyScene();

$("panel-toggle").addEventListener("click", () => document.body.classList.toggle("panel-open"));

// ── Models: the ignored folder (vite.config.mjs) and dropped files ──

const modelSelect = $<HTMLSelectElement>("model");

const openModel = async (name: string) => {
  const src = dropped.get(name) ?? `/models/${encodeURIComponent(name)}`;
  status.textContent = `Loading ${name} …`;
  try {
    const known = !!state.placements[name];
    state.model = name;
    await stage.load(src, placement());
    if (!known) state.placements[name] = stage.upright(placement());
    placementControls.refresh(placement());
    makeRunner();
    start("in");
    status.textContent = name;
    store();
  } catch (error) {
    status.textContent = `${name}: ${(error as Error).message}`;
  }
};

const addModel = (name: string) => {
  if (Array.from(modelSelect.options).some(option => option.value === name)) return;
  const option = el("option", "", name);
  option.value = name;
  modelSelect.append(option);
};

modelSelect.addEventListener("change", () => void openModel(modelSelect.value));

const dropFile = (file: File | undefined) => {
  if (!file || !/\.glb$/i.test(file.name)) {
    status.textContent = "Drop a .glb file";
    return;
  }
  dropped.set(file.name, URL.createObjectURL(file));
  addModel(file.name);
  modelSelect.value = file.name;
  void openModel(file.name);
};
window.addEventListener("dragover", event => event.preventDefault());
window.addEventListener("drop", event => {
  event.preventDefault();
  dropFile(event.dataTransfer?.files[0]);
});

showConcept();

void (async () => {
  let names: string[] = [];
  try {
    names = ((await (await fetch("/models/index.json")).json()) as Array<{ name: string }>).map(model => model.name);
  } catch {
    // No folder: models come by drag and drop
  }
  names.forEach(addModel);
  const first = names.includes(state.model) ? state.model : names[0];
  if (!first) {
    status.textContent = "No model yet – drop a .glb on the page, or put one into sandbox/reveal/models/";
    return;
  }
  modelSelect.value = first;
  await openModel(first);
})();
