import { type Entry, EntryCategory } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { escapeHtml, privacyHref } from "@/utils";
import { GraphicsService } from "@/services/GraphicsService";
import { renderEntryText, type VariableLookup } from "@shared/text/entry-text";
import { getEntryPlaceLabel } from "@/utils/game-config";
import { EmbedConsentService } from "@/services/EmbedConsentService";
import { goldButton } from "@/components/buttons";
import { categoryLabel, type LinkEmbed, linkEmbed } from "./entries-model";
import { t } from "i18next";

/**
 * One entry (design p. 23–25, 32–33, 38–39, #289): meta table – Name, Page, Category; for texts Title, Page, Category,
 * Author –, then per category – glossary: text + image with its caption (the entry's `caption`, Small, muted); text:
 * long text; video: a note to scan the access page + a preview player; link: the embedded player across the screen's
 * full width (the page's gutter, `--content-gutter`, is bled) or the embedded page, + "open in a new tab".
 * Another site's player or page loads only after the reader agreed (#351): until then a card in its place says who
 * would load and that they may set cookies and track, with the provider's privacy policy and the app's (#353), a button that loads it
 * (a video then plays at once) and "Always for <provider>" (`EmbedConsentService`, taken back in Info → Settings).
 * Nothing is requested from the provider before that – the card's poster is the entry's own image, if it has one.
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
    this.shadowRoot!.addEventListener("click", this.handleClick);
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
          /* The consent card (#351) in the embed's place, across the gutter like the player */
          .gate {
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: .75rem;
            aspect-ratio: 16 / 9;
            width: calc(100% + 2 * var(--content-gutter, 0px));
            margin: 1rem calc(-1 * var(--content-gutter, 0px));
            padding: 1rem var(--content-gutter, 1rem);
            box-sizing: border-box;
            background: #000 center / cover no-repeat;
            font-size: var(--text-size-small);
            line-height: var(--text-line);
          }
          .gate .who { color: var(--color-muted); text-transform: uppercase; letter-spacing: .08em; }
          .gate p { margin: 0; }
          .gate .acts { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem 1.25rem; margin-top: .25rem; }
          .gate label { display: inline-flex; align-items: center; gap: .4rem; }
          .gate input { accent-color: #d2ae5a; margin: 0; }
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
        const allowed = embed && EmbedConsentService.getInstance().isAllowed(embed.provider.id);
        const frame = !embed ? "" : allowed ? this.frameHtml(embed, entry.title, false) : this.gateHtml(embed, src);
        return /* html */ `
          ${text}
          ${frame}
          ${entry.media ? `<p><a href="${escapeHtml(entry.media)}" target="_blank" rel="noopener noreferrer">${t("entry:openInNewTab")}</a></p>` : ""}
        `;
      }
    }
  }

  /** The player or page itself; `play`: the reader just tapped, so a video starts at once */
  private frameHtml(embed: LinkEmbed, title: string, play: boolean): string {
    return embed.kind === "video"
      ? `<iframe class="video" src="${escapeHtml(play ? embed.playSrc : embed.src)}" title="${escapeHtml(title)}" loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
      : `<iframe class="page" src="${escapeHtml(embed.src)}" title="${escapeHtml(title)}" loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }

  /** The consent card in the embed's place (#351); `poster`: the entry's own image, darkened behind the text */
  private gateHtml(embed: LinkEmbed, poster: string): string {
    const provider = embed.provider.name;
    const video = embed.kind === "video";
    const background = poster ? ` style="background-image: linear-gradient(rgba(0,0,0,.62), rgba(0,0,0,.8)), url(&quot;${escapeHtml(poster)}&quot;)"` : "";
    const policy = embed.provider.policy
      ? ` <a href="${escapeHtml(embed.provider.policy)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("entry:embedPolicy", { provider }))}</a>`
      : "";
    return /* html */ `
      <div class="gate" data-embed-gate${background}>
        <div class="who">${escapeHtml(t(video ? "entry:embedVideoFrom" : "entry:embedPageFrom", { provider }))}</div>
        <p>${escapeHtml(t(video ? "entry:embedVideoNotice" : "entry:embedPageNotice", { provider }))}${policy}
          · <a href="${escapeHtml(privacyHref())}">${escapeHtml(t("entry:embedOurPolicy"))}</a></p>
        <div class="acts">
          ${goldButton({ label: t(video ? "entry:embedPlay" : "entry:embedShow"), primary: true, attrs: { "data-action": "load-embed" } })}
          <label><input type="checkbox" data-embed-always> ${escapeHtml(t("entry:embedAlways", { provider }))}</label>
        </div>
      </div>
    `;
  }

  /** The card's button: remember "Always" if ticked, then put the player or page in the card's place */
  private handleClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action=load-embed]");
    const gate = button?.closest<HTMLElement>("[data-embed-gate]");
    const entry = this._entry;
    const embed = entry?.media ? linkEmbed(entry.media) : undefined;
    if (!gate || !entry || !embed) return;
    if (gate.querySelector<HTMLInputElement>("[data-embed-always]")?.checked) EmbedConsentService.getInstance().allow(embed.provider.id);
    gate.outerHTML = this.frameHtml(embed, entry.title, true);
  };
}

customElements.define("entry-detail", EntryDetail);
