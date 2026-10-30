// Records the demo video's scenes (README.md) from a running editor with headless Edge over CDP: each scene is set up
// off camera (its page, stored view and tab), then recorded with Page.startScreencast while scripted input (mouse on
// the desktop, touch on the phone, eased moves) plays it. Frames land in <out>/<format>/<scene>/ with frames.json.
//
//   node record.mjs --format desktop|phone --out <dir> --token-file <path> [--editor http://127.0.0.1:5187/editor]
//                   [--port 9341] [--scenes books,orbit,…] [--no-warm]
//
// The token file holds an editor session of a local API (prepare.mjs writes it); it is put into the page's storage
// and never printed. Recording-only CSS hides the account's address in the top bar.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Page, launchBrowser, sleep, startRecording } from "./cdp.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]);
    return pairs;
  }, []),
);
const format = args.format === "phone" ? "phone" : "desktop";
const phone = format === "phone";
const editor = (args.editor ?? "http://127.0.0.1:5187/editor").replace(/\/+$/, "");
const port = Number(args.port ?? 9341);
const out = join(args.out ?? "recording", format);
if (!args["token-file"]) throw new Error("--token-file is needed (prepare.mjs writes it)");
const token = readFileSync(args["token-file"], "utf8").trim();

// The two formats: 1440 × 810 CSS px at 4/3 = 1920 × 1080; 390 × 693 at 1080/390 = 1080 × 1920 (a phone, 9:16)
const VIEW = phone ? { width: 390, height: 693, scale: 1080 / 390 } : { width: 1440, height: 810, scale: 4 / 3 };

// Recording only: the account's address in the top bar, the AI connections (tokens) on the books page
// and Android's blue tap highlight (a flash over every tapped link in the emulated phone, which a recording shows as a glitch)
const CSS = ".top .email { display: none !important; } section.ai { display: none !important; } * { -webkit-tap-highlight-color: transparent !important; }";

const BOOK = "demo";

/** A stored view of the stage (`osct-preview`): where the camera is, the sky, the desk */
const preview = (orbit) => ({ view: "reader", shading: "rendered", orbit, hdri: "wooden_studio_17", desk: "eiermann", wobble: 0, grid: false, gridMm: 10, origin: "top-left" });

// ---- helpers the scenes share -----------------------------------------------------------------------------------

/** A drag with the dot following it (mouse on the desktop, a finger on the phone) */
async function gesture(page, x1, y1, x2, y2, ms, opts = {}) {
  const onStep = (x, y) => page.dot(x, y, true);
  await page.dot(x1, y1, true);
  if (phone) await page.swipe(x1, y1, x2, y2, ms, onStep);
  else await page.drag(x1, y1, x2, y2, ms, { ...opts, onStep });
  await page.dot(x2, y2, false);
}

/** A tap or a click on an element, found by selector (and text) */
async function press(page, selector, text = null) {
  const c = await page.center(selector, text);
  if (phone) await page.tap(c.x, c.y);
  else await page.click(c.x, c.y);
  return c;
}

/** Scrolls an element smoothly to the middle of its panel (as a hand would), then presses it */
async function reveal(page, selector, text = null) {
  await page.eval(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = ${text === null ? "els[0]" : `els.find((e) => e.textContent.trim() === ${JSON.stringify(text)})`};
    el.scrollIntoView({ behavior: "smooth", block: "center" }); })()`);
  await sleep(700);
  return press(page, selector, text);
}

/** Marks the Library card's *Pick* button of the file whose card names `word` (data-demo-pick), scrolled to it */
const markPick = (page, word, scroll = false) =>
  page.eval(`(() => { const pick = [...document.querySelectorAll("button")].find((b) => {
      if (b.textContent.trim() !== "Pick") return false;
      let card = b; while (card && !card.textContent.includes(${JSON.stringify(word)})) card = card.parentElement;
      return card && card.querySelectorAll("button").length <= 2; });
    pick.setAttribute("data-demo-pick", "");
    if (${scroll}) pick.scrollIntoView({ behavior: "smooth", block: "center" }); })()`);

/** Off camera: the Code tab once, so its editor (Monaco) is loaded when the scene opens it */
async function preloadCode(page) {
  await tab(page, "Code");
  await page.waitFor(`!!document.querySelector(".monaco-editor")`, 20000);
  await sleep(300);
  await tab(page, phone ? "Entity" : "Stage");
  await sleep(800);
}

/** A panel tab: its word on the desktop, its icon (aria-label) on the phone */
const tab = (page, name) => (phone ? press(page, `button.tab[aria-label="${name}"]`) : press(page, "button.tab", name));

/** The scrub field of a parameter row (press and slide) */
const scrubField = (page, label) => page.center(`[role=group][aria-label="${label}"]`);

// ---- the scenes ---------------------------------------------------------------------------------------------------
// Each: the page (`url`, under the editor), the stored state (`storage`), how long the page settles before the
// recording starts (`settle`), and `act` – what the camera sees. Coordinates are CSS pixels of the format's viewport;
// the stage's are for the stored orbit (the gizmo's handles lie where that view puts them).

const SCENES = {
  desktop: [
    {
      name: "books",
      url: "/",
      settle: 1500,
      async act(page) {
        await sleep(700);
        await page.moveTo(200, 250, 300);
        await sleep(500);
        await press(page, "a.book");
        await sleep(1800);
        const card = await page.center("a.spread", "The key");
        await page.moveTo(card.x, card.y - 40, 300);
        await sleep(300);
        await page.click(card.x, card.y - 40, { button: "right" });
        await sleep(900);
        await press(page, "[role=menuitem]", "Open");
        await sleep(1500);
      },
    },
    {
      name: "orbit",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 620, tilt: 46, yaw: -32 }), tab: "stage" },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await gesture(page, 640, 470, 790, 420, 3200);
        await sleep(400);
      },
    },
    {
      name: "select-drag",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 520, tilt: 38, yaw: -18 }), tab: "stage" },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await press(page, "span.name", "Tank");
        await sleep(1000);
        await gesture(page, 841, 277, 640, 250, 1600, { hoverMs: 200 });
        await sleep(700);
      },
    },
    {
      name: "aquarium",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 210, tilt: 55, yaw: -10, pan: { x: 150, y: 128 } }), tab: "stage" },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await gesture(page, 900, 520, 780, 500, 3500);
        await sleep(300);
      },
    },
    {
      name: "library",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 520, tilt: 38, yaw: -18 }), tab: "stage" },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await press(page, "span.name", "model");
        await sleep(800);
        await press(page, "button", "Library…");
        await sleep(1400);
        await markPick(page, "chest");
        await press(page, "[data-demo-pick]");
        await sleep(1800);
      },
    },
    {
      name: "bloom",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 600, tilt: 42, yaw: -12 }), tab: "stage" },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await press(page, "button", "+ bloom");
        await sleep(900);
        const f = await scrubField(page, "strength");
        await gesture(page, f.x, f.y, f.x - 30, f.y, 1600, { hoverMs: 150 });
        await sleep(700);
      },
    },
    {
      name: "environment",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 560, tilt: 44, yaw: -14 }), tab: "environment" },
      settle: 6000,
      async act(page) {
        await sleep(300);
        const f = await scrubField(page, "look up");
        await gesture(page, f.x, f.y, f.x + 60, f.y, 2400, { hoverMs: 150 });
        await sleep(600);
      },
    },
    {
      // Last: "make it code" saves a plugin into the draft (a fresh import undoes it – README.md)
      name: "code",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 520, tilt: 38, yaw: -18 }), tab: "stage" },
      settle: 6000,
      prep: preloadCode,
      async act(page) {
        await sleep(300);
        await press(page, "span.name", "model");
        await sleep(700);
        await press(page, "button, a", "make it code");
        await sleep(900);
        await tab(page, "Code");
        await sleep(700);
        // The node shows its new type once the plugin runs
        await press(page, "button", "Run");
        await sleep(700);
        await gesture(page, 520, 520, 650, 495, 2000); // the stage beside the code: a slow orbit
        await sleep(400);
      },
    },
  ],
  phone: [
    {
      name: "books",
      url: "/",
      settle: 1500,
      async act(page) {
        await sleep(600);
        await press(page, "a.book");
        await sleep(1600);
        await gesture(page, 300, 560, 300, 330, 900);
        await sleep(500);
        const card = await page.center("a.spread", "The key");
        await page.longPress(card.x, card.y - 20, 800);
        await sleep(900);
        await press(page, "[role=menuitem]", "Open");
        await sleep(1200);
      },
    },
    {
      name: "orbit",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 640, tilt: 46, yaw: -32 }), tab: "stage", widths: { sheet: 0.34 } },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await gesture(page, 140, 330, 260, 290, 3200);
        await sleep(400);
      },
    },
    {
      name: "sheet-toolbar",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 560, tilt: 40, yaw: -18 }), tab: "stage", widths: { sheet: 0.34 } },
      settle: 6000,
      async act(page) {
        await sleep(300);
        // The grouped toolbar (#180): the shading group opens its menu
        await page.tap(230, 80);
        await sleep(700);
        await press(page, "[role=menuitemradio], [role=menuitem]", "Wire");
        await sleep(1000);
        await page.tap(230, 80);
        await sleep(500);
        await press(page, "[role=menuitemradio], [role=menuitem]", "Rendered");
        await sleep(600);
        // The sheet dragged up (#155): the toolbar and ‹ › stay reachable (dragging it down would show the stage's
        // black until the canvas resizes on release)
        const grip = await page.center("[role=separator][aria-label='Panel height']");
        await gesture(page, grip.x, grip.y, grip.x, 170, 900);
        await sleep(900);
      },
    },
    {
      name: "select-drag",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 520, tilt: 40, yaw: -18 }), tab: "entity", widths: { sheet: 0.34 } },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await page.tap(265, 177); // the aquarium on the stage: its entity is selected, the gizmo on it
        await sleep(1100);
        await gesture(page, 300, 177, 205, 192, 1500); // the gizmo's X handle in this view
        await sleep(700);
      },
    },
    {
      name: "aquarium",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 260, tilt: 55, yaw: -10, pan: { x: 150, y: 128 } }), tab: "stage", widths: { sheet: 0.34 } },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await gesture(page, 260, 320, 150, 300, 3500);
        await sleep(300);
      },
    },
    {
      name: "library",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 520, tilt: 40, yaw: -18 }), tab: "entity", widths: { sheet: 0.34 } },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await page.tap(105, 260); // the key on the stage: its model is the entity's root
        await sleep(900);
        await reveal(page, "button", "Library…");
        await sleep(1000);
        await markPick(page, "chest", true);
        await sleep(700);
        await press(page, "[data-demo-pick]");
        await sleep(1800);
      },
    },
    {
      name: "bloom",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 640, tilt: 42, yaw: -12 }), tab: "stage", widths: { sheet: 0.5 } },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await reveal(page, "button", "+ bloom");
        await sleep(900);
        const f = await scrubField(page, "strength");
        await gesture(page, f.x, f.y, f.x - 30, f.y, 1600);
        await sleep(700);
      },
    },
    {
      name: "environment",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 600, tilt: 44, yaw: -14 }), tab: "environment", widths: { sheet: 0.5 } },
      settle: 6000,
      async act(page) {
        await sleep(300);
        await page.eval(`document.querySelector("[role=group][aria-label='look up']").scrollIntoView({ behavior: "smooth", block: "center" })`);
        await sleep(600);
        const f = await scrubField(page, "look up");
        await gesture(page, f.x, f.y, f.x + 60, f.y, 2400);
        await sleep(600);
      },
    },
    {
      name: "code",
      url: "/demo/the-key/",
      storage: { preview: preview({ distance: 520, tilt: 40, yaw: -18 }), tab: "entity", widths: { sheet: 0.34 } },
      settle: 6000,
      prep: preloadCode,
      async act(page) {
        await sleep(300);
        await page.tap(105, 260); // the key on the stage: its model (make it code on the aquarium leaves the tank empty – see README)
        await sleep(900);
        await press(page, "button, a", "make it code");
        await sleep(900);
        await tab(page, "Code");
        await sleep(700);
        await press(page, "button", "Run");
        await sleep(900);
        const grip = await page.center("[role=separator][aria-label='Panel height']");
        await gesture(page, grip.x, grip.y, grip.x, 140, 900);
        await sleep(900);
      },
    },
  ],
};

// ---- the run ------------------------------------------------------------------------------------------------------

const wanted = args.scenes ? args.scenes.split(",") : null;
const scenes = SCENES[format].filter((s) => !wanted || wanted.includes(s.name));
mkdirSync(out, { recursive: true });
const profile = join(out, "..", `profile-${format}`);
rmSync(profile, { recursive: true, force: true });

const browser = await launchBrowser({ port, profile, width: VIEW.width, height: VIEW.height, scale: VIEW.scale });
const page = await Page.open(port);
try {
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  // A page with unsaved edits asks before it is left: the next scene's page loads anyway
  page.on("Page.javascriptDialogOpening", () => page.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}));
  await page.viewport(VIEW.width, VIEW.height, 0, phone);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("osct-editor-session", ${JSON.stringify(token)}); } catch {}` });
  await page.injectCss(CSS);

  if (args["no-warm"] !== "true") {
    // Fill the browser's cache (sheets, models, skies from the CDN), so no scene shows a loading state
    for (const url of ["/", `/${BOOK}/`, `/${BOOK}/the-key/`, `/${BOOK}/the-switch/`]) {
      await page.goto(editor + url, url.split("/").length > 3 ? 8000 : 3000);
    }
  }

  const done = [];
  for (const scene of scenes) {
    // Off camera: a clean storage (the session kept), the scene's state, its page
    const storage = scene.storage ?? {};
    if ((await page.eval("location.origin")) !== new URL(editor).origin) await page.goto(`${editor}/`, 1500);
    await page.eval(`(() => { const s = localStorage.getItem("osct-editor-session"); localStorage.clear(); localStorage.setItem("osct-editor-session", s);
      localStorage.setItem("osct-editor-info", "open"); localStorage.setItem("osct-editor-tree", "open");
      ${storage.preview ? `localStorage.setItem("osct-preview", ${JSON.stringify(JSON.stringify(storage.preview))});` : ""}
      ${storage.tab ? `localStorage.setItem("osct-editor-tab", ${JSON.stringify(storage.tab)});` : ""}
      ${storage.widths ? `localStorage.setItem("osct-editor-widths", ${JSON.stringify(JSON.stringify(storage.widths))});` : ""}
    })()`);
    await page.goto(`${editor}${scene.url === "/" ? "/" : scene.url}`, scene.settle);
    if (scene.prep) await scene.prep(page);
    await page.mouseEvent("mouseMoved", VIEW.width - 2, VIEW.height - 2).catch(() => {});
    const dir = join(out, scene.name);
    rmSync(dir, { recursive: true, force: true });
    const recording = await startRecording(page, dir, { quality: 92, maxWidth: Math.round(VIEW.width * VIEW.scale), maxHeight: Math.round(VIEW.height * VIEW.scale) });
    await sleep(150);
    console.log(`${format} · ${scene.name}`);
    await scene.act(page);
    const { frames } = await recording.stop();
    done.push({ name: scene.name, dir, frames: frames.length, seconds: frames.length ? frames.at(-1).t - frames[0].t : 0 });
  }
  writeFileSync(join(out, "scenes.json"), JSON.stringify(done, null, 1));
  for (const s of done) console.log(`${s.name}: ${s.frames} frames, ${s.seconds.toFixed(2)} s`);
} finally {
  await page.close();
  await browser.close();
}
