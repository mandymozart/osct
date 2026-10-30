// A small Chrome DevTools Protocol client for the demo video (README.md): one page target, input with eased moves,
// and a screencast recorder that writes JPEG/PNG frames with their timestamps. Node 22 (global WebSocket), no packages.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const EDGE = process.env.DEMO_BROWSER ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

/**
 * Starts a headless Edge (or Chrome: DEMO_BROWSER) with its own profile and debugging port. The device scale factor
 * is the browser's own (`--force-device-scale-factor`), not an emulated one: the screencast delivers frames in device
 * pixels only then (an emulated factor gives CSS-pixel frames).
 */
export async function launchBrowser({ port, profile, width, height, scale }) {
  const child = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization", `--force-device-scale-factor=${scale}`, `--window-size=${width},${height}`, "about:blank",
  ], { stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) break;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  return {
    port,
    async close() {
      try {
        const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const ws = new WebSocket(v.webSocketDebuggerUrl);
        await new Promise((r) => (ws.onopen = r));
        ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
        await sleep(800);
      } catch {
        // gone already
      }
      try {
        child.kill();
      } catch {
        // gone already
      }
    },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** easeInOutCubic: slow start, slow end */
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Calls `step(easedT)` about every frame for `ms` of real time, ending exactly at 1 */
export async function eased(ms, step, curve = ease) {
  const start = Date.now();
  for (;;) {
    const raw = Math.min(1, (Date.now() - start) / ms);
    await step(curve(raw), raw);
    if (raw >= 1) return;
    await sleep(14);
  }
}

export class Page {
  /** Opens a new tab on the browser at `port` and connects to it */
  static async open(port) {
    const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const target = await res.json();
    const page = new Page(target);
    await page.connect();
    return page;
  }

  constructor(target) {
    this.target = target;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.mouse = { x: 0, y: 0 };
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.target.webSocketDebuggerUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { res, rej, method } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(`${method}: ${msg.error.message}`));
          else res(msg.result);
        } else if (msg.method) {
          for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
        }
      };
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej, method }));
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
    return () => this.listeners.set(method, this.listeners.get(method).filter((f) => f !== fn));
  }

  /** Evaluates an expression (or an async function body as a string) in the page and returns its value */
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  async close() {
    try {
      await fetch(`http://127.0.0.1:${new URL(this.target.webSocketDebuggerUrl).port}/json/close/${this.target.id}`);
    } catch {
      // the browser may be gone already
    }
    this.ws?.close();
  }

  /** Viewport in CSS pixels with a device pixel ratio; `mobile` adds touch and the phone's user agent */
  async viewport(width, height, dpr, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    if (mobile) {
      await this.send("Emulation.setUserAgentOverride", {
        userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
        platform: "Android",
      });
    }
    this.width = width;
    this.height = height;
  }

  async goto(url, waitMs = 0) {
    const loaded = new Promise((r) => {
      const off = this.on("Page.loadEventFired", () => {
        off();
        r();
      });
    });
    await this.send("Page.navigate", { url });
    await loaded;
    if (waitMs) await sleep(waitMs);
  }

  /** Waits until `expression` is truthy (polling) */
  async waitFor(expression, timeout = 20000, every = 100) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        const v = await this.eval(expression);
        if (v) return v;
      } catch {
        // the page may be navigating
      }
      await sleep(every);
    }
    throw new Error(`waitFor timed out: ${expression}`);
  }

  /**
   * The centre of the first visible element matching `selector` – with `text`, the smallest one whose text is `text`
   * (or contains it, when no element's text is exactly it)
   */
  async center(selector, text = null, scroll = false) {
    const r = await this.eval(`(() => {
      const text = ${JSON.stringify(text)};
      const area = (e) => { const b = e.getBoundingClientRect(); return b.width * b.height; };
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => area(e) > 0);
      let el = els[0];
      if (text !== null) {
        const exact = els.filter((e) => e.textContent.trim() === text);
        const some = exact.length ? exact : els.filter((e) => e.textContent.trim().includes(text));
        el = some.sort((a, b) => area(a) - area(b))[0];
      }
      if (!el) return null;
      if (${scroll}) el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
    })()`);
    if (!r) throw new Error(`no element: ${selector}${text ? ` "${text}"` : ""}`);
    return r;
  }

  // ---- mouse -------------------------------------------------------------------------------------------------------

  async mouseEvent(type, x, y, extra = {}) {
    await this.send("Input.dispatchMouseEvent", { type, x, y, ...extra });
  }

  /** Moves the mouse along an eased path in `ms` of real time (an event about every frame) */
  async moveTo(x, y, ms = 400, buttons = 0, onStep = null, modifiers = 0, button = "left") {
    const from = { ...this.mouse };
    await eased(ms, async (t) => {
      const px = lerp(from.x, x, t);
      const py = lerp(from.y, y, t);
      await this.mouseEvent("mouseMoved", px, py, buttons ? { buttons, button, modifiers } : { modifiers });
      this.mouse = { x: px, y: py };
      if (onStep) await onStep(px, py);
    });
  }

  async click(x, y, { button = "left", moveMs = 0 } = {}) {
    if (moveMs) await this.moveTo(x, y, moveMs);
    this.mouse = { x, y };
    await this.mouseEvent("mouseMoved", x, y);
    await this.mouseEvent("mousePressed", x, y, { button, buttons: button === "left" ? 1 : 2, clickCount: 1 });
    await sleep(40);
    await this.mouseEvent("mouseReleased", x, y, { button, buttons: 0, clickCount: 1 });
  }

  async clickOn(selector, text = null, opts = {}) {
    const c = await this.center(selector, text);
    await this.click(c.x, c.y, opts);
    return c;
  }

  /** Presses at (x1, y1), drags along an eased path to (x2, y2) over `ms`, releases */
  async drag(x1, y1, x2, y2, ms = 1200, { button = "left", onStep = null, hoverMs = 0, modifiers = 0 } = {}) {
    const buttons = button === "left" ? 1 : button === "right" ? 2 : 4;
    this.mouse = { x: x1, y: y1 };
    await this.mouseEvent("mouseMoved", x1, y1);
    // A gizmo knows its handle from the hover: let a frame or two see the pointer over it before the press
    if (hoverMs) {
      await sleep(hoverMs / 2);
      await this.mouseEvent("mouseMoved", x1 + 1, y1);
      await sleep(hoverMs / 2);
      await this.mouseEvent("mouseMoved", x1, y1);
    }
    await this.mouseEvent("mousePressed", x1, y1, { button, buttons, clickCount: 1, modifiers });
    await sleep(60);
    await this.moveTo(x2, y2, ms, buttons, onStep, modifiers, button);
    await sleep(60);
    await this.mouseEvent("mouseReleased", x2, y2, { button, buttons: 0, clickCount: 1, modifiers });
  }

  async wheel(x, y, deltaY, steps = 10, ms = 600) {
    for (let i = 0; i < steps; i++) {
      await this.mouseEvent("mouseWheel", x, y, { deltaX: 0, deltaY: deltaY / steps });
      await sleep(ms / steps);
    }
  }

  async key(key, code = key, keyCode = 0, modifiers = 0) {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, modifiers });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, modifiers });
  }

  // ---- touch -------------------------------------------------------------------------------------------------------

  async tap(x, y) {
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await sleep(60);
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  async tapOn(selector, text = null) {
    const c = await this.center(selector, text);
    await this.tap(c.x, c.y);
    return c;
  }

  /** One finger from (x1, y1) to (x2, y2) over `ms`, eased */
  async swipe(x1, y1, x2, y2, ms = 900, onStep = null) {
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1, id: 1 }] });
    await sleep(30);
    await eased(ms, async (t) => {
      const x = lerp(x1, x2, t);
      const y = lerp(y1, y2, t);
      await this.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
      if (onStep) await onStep(x, y);
    });
    await sleep(40);
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  /** Holds one finger for `ms` (a long press) */
  async longPress(x, y, ms = 700) {
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await sleep(ms);
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  // ---- the recording's own overlays ------------------------------------------------------------------------------

  /** CSS for the recording only (hides the account's e-mail and the like) – re-applied on every document */
  async injectCss(css) {
    // At document start there is no <html> yet: the observer and the interval add the style as soon as there is
    const source = `(() => { const add = () => { if (!document.head || document.getElementById("demo-video-css")) return;
      const s = document.createElement("style"); s.id = "demo-video-css"; s.textContent = ${JSON.stringify(css)};
      document.head.appendChild(s); };
      add(); document.addEventListener("DOMContentLoaded", add); setInterval(add, 50);
      new MutationObserver(add).observe(document, { childList: true, subtree: true }); })();`;
    await this.send("Page.addScriptToEvaluateOnNewDocument", { source });
    await this.eval(source);
  }

  /** A subtle dot that follows the pointer during a drag (no cursor otherwise) */
  async dot(x, y, visible = true) {
    await this.eval(`(() => {
      let d = document.getElementById("demo-video-dot");
      if (!d) { d = document.createElement("div"); d.id = "demo-video-dot";
        d.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;" +
          "background:rgba(255,255,255,.55);box-shadow:0 0 0 1.5px rgba(0,0,0,.35);pointer-events:none;transition:opacity .15s";
        document.body.appendChild(d); }
      d.style.left = "${x}px"; d.style.top = "${y}px"; d.style.opacity = "${visible ? 1 : 0}";
    })()`);
  }
}

/**
 * Records the page with Page.startScreencast into `dir` (frame-000001.jpg …, plus frames.json with each frame's
 * timestamp in seconds). `stop()` ends it and returns the list. The cutter resamples to a constant 30 fps.
 */
export async function startRecording(page, dir, { format = "jpeg", quality = 92, maxWidth, maxHeight } = {}) {
  mkdirSync(dir, { recursive: true });
  const frames = [];
  let n = 0;
  const off = page.on("Page.screencastFrame", async (p) => {
    const name = `frame-${String(++n).padStart(6, "0")}.${format === "png" ? "png" : "jpg"}`;
    writeFileSync(join(dir, name), Buffer.from(p.data, "base64"));
    frames.push({ name, t: p.metadata.timestamp });
    page.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
  });
  await page.send("Page.startScreencast", { format, quality, maxWidth, maxHeight, everyNthFrame: 1 });
  const marks = [];
  return {
    /** A named point in time (seconds, the screencast's clock) – the scene boundaries for the cutter */
    mark(name) {
      marks.push({ name, t: Date.now() / 1000 });
    },
    async stop() {
      await page.send("Page.stopScreencast");
      await sleep(200);
      off();
      writeFileSync(join(dir, "frames.json"), JSON.stringify({ frames, marks }, null, 1));
      return { frames, marks };
    },
  };
}
