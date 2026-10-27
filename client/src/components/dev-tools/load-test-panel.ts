import {
  DEFAULT_LOAD_TEST, getEngineState, getLoadTest, LoadTestControl, LoadTestOptions, LoadTestProgress,
  subscribeEngineState, subscribeLoadTest,
} from "@/components/ar-bridges/utils/tracker-debug";
import { getBook, getConfigVersion } from "@/utils/game-config";
import { LOAD_TEST_COLUMNS, loadTestCells, loadTestReport } from "./load-test-report";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COVER_CHOICES = [0, 2, 3];
const STEADY_CHOICES = [4000, 6000, 10000];

// The run outlives the panel (closing it does not stop the test); reopening shows it again
let progress: LoadTestProgress | null = null;
let control: LoadTestControl | null = null;
let options: LoadTestOptions = { ...DEFAULT_LOAD_TEST };
let startedAt = new Date();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());

const running = () => !!progress && !["idle", "done", "stopped", "error"].includes(progress.phase);

/**
 * Debug load test panel (bottom sheet, opened from the debug overlay): runs the engine load test
 * (`ar/load-test.ts`) on the spread being scanned and shows its steps; Download .md / Copy give the report
 * (`load-test-report.ts`). The phone stays on a page of the printed book; the panel tells the tester when to
 * cover and uncover the lens (covers 0 = no tester action, then without re-find times).
 */
export class LoadTestPanel extends HTMLElement {
  private shadow: ShadowRoot;
  private cleanups: Array<() => void> = [];

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.setAttribute("role", "dialog");
    this.setAttribute("aria-label", "Engine load test");
    const render = () => this.render();
    listeners.add(render);
    this.cleanups.push(() => listeners.delete(render), subscribeEngineState(render), subscribeLoadTest(render));
    this.shadow.addEventListener("click", this.onClick);
    this.render();
  }

  disconnectedCallback() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
  }

  report(): string {
    if (!progress) return "";
    return loadTestReport(progress.results, {
      bookTitle: getBook().title,
      appVersion: __VITE_APP_VERSION__,
      contentHash: getConfigVersion().hash ?? "",
      device: navigator.userAgent,
      date: startedAt,
      spreadId: progress.spreadId ?? "–",
      spreadTargets: progress.spreadTargets,
      options,
    });
  }

  private render() {
    const engine = getEngineState();
    const canRun = !!getLoadTest();
    const busy = running();
    const p = progress;
    const rows = (p?.results ?? []).map(result => `<tr>${loadTestCells(result).map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
    const message = p?.message
      ?? (canRun
        ? "Hold the phone on a trigger, then Start."
        : "Start scanning first – the test needs the camera.");

    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed; left: .25rem; right: .25rem; bottom: calc(env(safe-area-inset-bottom) + .25rem);
          max-height: 50vh; overflow-y: auto; z-index: 10000; box-sizing: border-box; padding: .25rem .5rem .5rem;
          border-radius: .5rem; background: rgba(0, 0, 0, .8); color: #0f0; font: .75rem/1.25rem monospace;
          cursor: default; user-select: none;
        }
        .head, .actions { display: flex; justify-content: space-between; align-items: center; gap: .5rem; flex-wrap: wrap; }
        .head { position: sticky; top: -.25rem; background: #000; padding: .25rem 0; z-index: 1; }
        .message { color: #ff0; font-size: .9375rem; line-height: 1.375rem; padding: .375rem 0; }
        .message.error { color: #f66; }
        .small { font-size: .6875rem; color: #9c9; }
        table { border-collapse: collapse; width: 100%; margin-top: .25rem; }
        th, td { border-top: .0625rem solid #030; padding: 0 .25rem; text-align: right; white-space: nowrap; }
        th { color: #9c9; font-weight: normal; font-size: .625rem; line-height: .875rem; vertical-align: bottom; white-space: normal; }
        .scroll { overflow-x: auto; }
        button { font: inherit; color: inherit; background: none; border: .0625rem solid #0f0;
          border-radius: .25rem; padding: 0 .375rem; cursor: pointer; }
        button:disabled { opacity: .4; cursor: default; }
        button.primary { background: #0f0; color: #000; }
        .actions { margin-top: .5rem; }
      </style>
      <div class="head">
        <span>load test · <span class="small">${escapeHtml(p?.spreadId ?? engine.current?.spreadId ?? "no spread")} · engine ${engine.ready}/${engine.targets} targets${engine.extractingSince !== null ? " · extracting" : ""}${p && busy ? ` · step ${p.step}/${p.steps}` : ""}</span></span>
        <span>
          <button data-action="covers" ${busy ? "disabled" : ""}>covers ${options.covers}</button>
          <button data-action="steady" ${busy ? "disabled" : ""}>hold ${options.steadyMs / 1000} s</button>
          <button data-action="close" aria-label="Close">×</button>
        </span>
      </div>
      <div class="message ${p?.phase === "error" ? "error" : ""}">${escapeHtml(message)}</div>
      ${rows ? `<div class="scroll"><table><tr>${LOAD_TEST_COLUMNS.map(column => `<th>${escapeHtml(column)}</th>`).join("")}</tr>${rows}</table></div>` : ""}
      <div class="actions">
        <span>
          ${busy
            ? `<button data-action="stop">Stop</button>`
            : `<button class="primary" data-action="start" ${canRun ? "" : "disabled"}>Start</button>`}
        </span>
        <span>
          <button data-action="download" ${p?.results.length ? "" : "disabled"}>Download .md</button>
          <button data-action="copy" ${p?.results.length ? "" : "disabled"}>Copy</button>
        </span>
      </div>
      <div class="small">Steps: the window next to the scanned page grows to 0, 5, 10, 20, 40, 80, all other targets (nearest spreads first); their content is preloaded too. Use the app as usual – pages switch.</div>
    `;
  }

  private start() {
    const runner = getLoadTest();
    if (!runner || running()) return;
    startedAt = new Date();
    const runOptions = { ...options };
    progress = null;
    control = runner(runOptions, next => {
      progress = next;
      if (!running()) control = null;
      changed();
    });
    changed();
  }

  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!button) return;
    switch (button.dataset.action) {
      case "close":
        return this.remove();
      case "start":
        return this.start();
      case "stop":
        control?.stop();
        return;
      case "covers":
        options = { ...options, covers: COVER_CHOICES[(COVER_CHOICES.indexOf(options.covers) + 1) % COVER_CHOICES.length] };
        return this.render();
      case "steady":
        options = { ...options, steadyMs: STEADY_CHOICES[(STEADY_CHOICES.indexOf(options.steadyMs) + 1) % STEADY_CHOICES.length] };
        return this.render();
      case "download":
        return this.download();
      case "copy":
        return void this.copy(button);
    }
  };

  private download() {
    const blob = new Blob([this.report()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `osct-load-test-${startedAt.toISOString().slice(0, 16).replace(/[T:]/g, "-")}.md`;
    this.shadow.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async copy(button: HTMLElement) {
    const text = this.report();
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // No clipboard API (http on a LAN address): copy through a selected text field
      const area = document.createElement("textarea");
      area.value = text;
      this.shadow.appendChild(area);
      area.select();
      copied = document.execCommand("copy");
      area.remove();
    }
    button.textContent = copied ? "Copied" : "Copy failed";
    setTimeout(() => (button.textContent = "Copy"), 1500);
  }
}

if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true") {
  customElements.define("load-test-panel", LoadTestPanel);
}
