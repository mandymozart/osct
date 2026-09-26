import { Entry, EntryCategory } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { escapeHtml, paragraphs } from "@/utils";
import { categoryLabel, linkEmbed } from "./entries-model";
import { tHtml } from "@/i18n";

/**
 * One entry (design p.15, 20, 25, 30–31): meta table (name, access page, category, author for texts),
 * then per category – glossary: text + image; text: long text; video: a note to scan the access page +
 * a preview player (to check rendering); link: embedded player/page + "open in a new tab".
 * The page sets `entry`; `null` empties it (stops media).
 */
export class EntryDetail extends HTMLElement {
  private _entry: Entry | null = null;

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
          p { margin: 0 0 1em; white-space: pre-line; }
          a { color: var(--color-accent); }
          .rule-table { margin-bottom: 1.5rem; }
          .body p + p { text-indent: 2em; margin-top: -1em; }
          img.entry-image, video, iframe {
            display: block;
            width: 100%;
            border: none;
            margin: 1rem 0;
            background: #000;
          }
          img.entry-image { background: none; }
          iframe.video { aspect-ratio: 16 / 9; }
          iframe.page { height: 70vh; background: #fff; }
          .hint { color: var(--color-muted); font-size: var(--text-size-small); }
        </style>
        <table class="rule-table">
          <tr><th scope="row">${tHtml("entry.entryName")}</th><td>${escapeHtml(entry.title)}</td></tr>
          <tr><th scope="row">${tHtml("entry.accessPage")}</th><td>${entry.page}</td></tr>
          <tr><th scope="row">${tHtml("entry.category")}</th><td>${escapeHtml(categoryLabel(entry.category))}</td></tr>
          ${entry.category === EntryCategory.Text && entry.author ? `<tr><th scope="row">${tHtml("entry.author")}</th><td>${escapeHtml(entry.author)}</td></tr>` : ""}
        </table>
        <div class="body">${this.bodyHtml(entry)}</div>
      `
      : "";
  }

  private bodyHtml(entry: Entry): string {
    const text = paragraphs(entry.body).map(p => `<p>${escapeHtml(p)}</p>`).join("");
    const image = entry.image ? `<img class="entry-image" src="${escapeHtml(entry.image)}" alt="" loading="lazy">` : "";

    switch (entry.category) {
      case EntryCategory.Glossary:
        return text + image;
      case EntryCategory.Text:
        return text;
      case EntryCategory.Video: {
        const video = entry.target?.entity?.assets.find(a => a.assetType === "video");
        return /* html */ `
          <p>${tHtml("entry.goToPage", { page: entry.page })}</p>
          ${text}
          ${video ? `<p class="hint">${tHtml("entry.preview")}</p>
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
          ${entry.media ? `<p><a href="${escapeHtml(entry.media)}" target="_blank" rel="noopener noreferrer">${tHtml("entry.openInNewTab")}</a></p>` : ""}
        `;
      }
    }
  }
}

customElements.define("entry-detail", EntryDetail);
