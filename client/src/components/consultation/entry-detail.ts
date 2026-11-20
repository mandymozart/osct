import { type Entry, EntryCategory } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { escapeHtml } from "@/utils";
import { GraphicsService } from "@/services/GraphicsService";
import { renderEntryText, type VariableLookup } from "@shared/text/entry-text";
import { getEntryPlaceLabel } from "@/utils/game-config";
import { categoryLabel, linkEmbed } from "./entries-model";
import { t } from "i18next";

/**
 * One entry (design p. 23–25, 32–33, 38–39, #289): meta table – Name, Page, Category; for texts Title, Page, Category,
 * Author –, then per category – glossary: text + image with its caption (the entry's `caption`, Small, muted); text:
 * long text; video: a note to scan the access page + a preview player; link: the embedded player across the screen's
 * full width (the page's gutter, `--content-gutter`, is bled) or the embedded page, + "open in a new tab".
 * The body is set in Medium (`--text-size`).
 * The body is the content's Markdown with the experience's variables (`renderEntryText`, the editor's preview renders the same):
 * the page sets `variables` (their values when the entry opens), then `entry`; `null` empties it and stops media.
 */
export class EntryDetail extends HTMLElement {
  private _entry: Entry | null = null;
  /** The experience's variables for the body's `{…}` – none: every variable is unset */
  variables: VariableLookup = () => undefined;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  get entry(): Entry | null {
    return this._entry;
  }

  set entry(entry: Entry | null) {
    this._entry = entry;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    if (!this.shadowRoot) return;
    const entry = this._entry;
    this.shadowRoot.innerHTML = entry
      ? /* html */ `
        <style>
          :host { display: block; }
          p { margin: 0 0 1em; }
          a { color: var(--color-accent); }
          .rule-table { margin-bottom: 1.5rem; }
          .body { font-size: var(--text-size); }
          .body p + p { text-indent: 2em; margin-top: -1em; }
          figure { margin: 1rem 0; }
          figure img.entry-image { margin: 0; }
          figcaption {
            margin-top: .5rem;
            font-size: var(--text-size-small);
            line-height: var(--text-line);
            color: var(--color-muted);
          }
          img.entry-image, video, iframe {
            display: block;
            width: 100%;
            border: none;
            margin: 1rem 0;
            background: #000;
          }
          img.entry-image { background: none; }
          iframe.video {
            aspect-ratio: 16 / 9;
            /* Full width (#289): across the page's gutter to the screen's edges */
            width: calc(100% + 2 * var(--content-gutter, 0px));
            margin-inline: calc(-1 * var(--content-gutter, 0px));
          }
          iframe.page { height: 70vh; background: #fff; }
          .hint { color: var(--color-muted); font-size: var(--text-size-small); }
        </style>
        <table class="rule-table">
          <tr><th scope="row">${t(entry.category === EntryCategory.Text ? "entry:title" : "entry:name")}</th><td>${escapeHtml(entry.title)}</td></tr>
          <tr><th scope="row">${t("entry:place")}</th><td>${escapeHtml(getEntryPlaceLabel(entry))}</td></tr>
          <tr><th scope="row">${t("entry:category")}</th><td>${escapeHtml(categoryLabel(entry.category))}</td></tr>
          ${entry.category === EntryCategory.Text && entry.author ? `<tr><th scope="row">${t("entry:author")}</th><td>${escapeHtml(entry.author)}</td></tr>` : ""}
        </table>
        <div class="body">${this.bodyHtml(entry)}</div>
      `
      : "";
  }

  private bodyHtml(entry: Entry): string {
    const text = renderEntryText(entry.body, { variables: this.variables }).html;
    // The level the reader's media quality chooses (#331), else the picture itself
    const src = entry.image ? GraphicsService.getInstance().mediaSrc("image", entry.image, entry.imageLevels) : "";
    const picture = src ? `<img class="entry-image" src="${escapeHtml(src)}" alt="" loading="lazy">` : "";
    const image = picture && entry.caption ? `<figure>${picture}<figcaption>${escapeHtml(entry.caption)}</figcaption></figure>` : picture;

    switch (entry.category) {
      case EntryCategory.Glossary:
        return text + image;
      case EntryCategory.Text:
        return text;
      case EntryCategory.Video: {
        const video = entry.target?.entity?.assets.find(a => a.assetType === "video");
        return /* html */ `
          <p>${escapeHtml(t("entry:goToPlace", { place: getEntryPlaceLabel(entry) }))}</p>
          ${text}
          ${video ? `<p class="hint">${t("entry:preview")}</p>
            <video src="${escapeHtml(video.src)}" controls playsinline preload="metadata"></video>` : ""}
        `;
      }
      case EntryCategory.Link: {
        const embed = entry.media ? linkEmbed(entry.media) : undefined;
        const frame = !embed
          ? ""
          : embed.kind === "video"
            ? `<iframe class="video" src="${escapeHtml(embed.src)}" title="${escapeHtml(entry.title)}" loading="lazy"
                allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
            : `<iframe class="page" src="${escapeHtml(embed.src)}" title="${escapeHtml(entry.title)}" loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
        return /* html */ `
          ${text}
          ${frame}
          ${entry.media ? `<p><a href="${escapeHtml(entry.media)}" target="_blank" rel="noopener noreferrer">${t("entry:openInNewTab")}</a></p>` : ""}
        `;
      }
    }
  }
}

customElements.define("entry-detail", EntryDetail);
