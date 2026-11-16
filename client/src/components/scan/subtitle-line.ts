import { SubtitleService } from "@/services";

/**
 * The subtitle line of the scan view: what a video of the found page says, in the reader's language – the text
 * `SubtitleService` holds (the AR scene's cue while subtitles are on). Empty and invisible between cues. Lives in the
 * scan page above the spread menu; taps pass through it.
 */
export class SubtitleLine extends HTMLElement {
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = /* html */ `
      <style>
        :host {
          display: flex;
          justify-content: center;
          padding: 0 1rem;
          pointer-events: none;
          opacity: 0;
          transition: opacity .15s ease;
        }
        :host([visible]) { opacity: 1; }
        p {
          margin: 0;
          max-width: 34rem;
          padding: .35rem .75rem;
          border-radius: .5rem;
          background: var(--subtitle-background);
          color: var(--color-on-dark);
          font-family: var(--font-design);
          letter-spacing: var(--tracking-design);
          font-size: 1.0625rem;
          line-height: 1.35;
          text-align: center;
          white-space: pre-line;
          text-wrap: balance;
        }
      </style>
      <p></p>
    `;
  }

  connectedCallback() {
    const subtitles = SubtitleService.getInstance();
    this.unsubscribe = subtitles.subscribe(line => this.show(line));
    this.show(subtitles.line);
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** The last line stays in place while it fades out */
  private show(line: string | null) {
    const text = this.shadowRoot?.querySelector("p");
    if (text && line !== null) text.textContent = line;
    this.toggleAttribute("visible", line !== null);
  }
}

customElements.define("subtitle-line", SubtitleLine);
