import { goldButton } from "@/components/buttons";
import i18next from "i18next";
import { BookDownload, PreloaderService } from "@/services";
import { SettingsSection } from "./settings-section";

/**
 * Whole-book download section (Tilman 2026-09-27, for testing how long it takes): puts every content file
 * on this device so the book works without internet. Shows the total size before, a progress bar with
 * "x of y MB" while it runs (it goes on when the page closes) and the size when done. No "clear" – removing
 * the app removes it.
 */
export class SettingsDownload extends SettingsSection {
  private preloader = PreloaderService.getInstance();
  private download: BookDownload | null = null;
  private unsubscribe?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = this.preloader.onBookDownload(download => this.update(download));
    void this.preloader.getBookDownload().then(download => {
      this.download = download;
      this.render();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  protected content(): string {
    const download = this.download;
    if (!download) return "";
    const total = megabytes(download.total);
    const button = (download.state === "idle" || download.state === "failed")
      ? `<div class="row">${goldButton({ label: i18next.t("settings:downloadButton"), attrs: { "data-action": "download" } })}</div>`
      : "";
    const progress = download.state === "running" ? /* html */ `
      <div class="bar" role="progressbar" aria-label="${i18next.t("settings:downloadButton")}"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent(download)}">
        <span style="width: ${percent(download)}%"></span>
      </div>` : "";
    const description = download.state === "running"
      ? i18next.t("settings:downloadProgress", { loaded: megabytes(download.loaded), total })
      : download.state === "done" ? i18next.t("settings:downloadDone", { size: total })
      : download.state === "failed" ? i18next.t("settings:downloadFailed", { size: total })
      : i18next.t("settings:downloadDescription", { size: total });
    return /* html */ `
      <style>
        .bar { height: .25rem; margin-top: .25rem; border-radius: .125rem; overflow: hidden; border: var(--rule); }
        .bar span { display: block; height: 100%; background: var(--gold-gradient); transition: width .2s linear; }
      </style>
      ${button}
      ${progress}
      <p class="description" role="status">${description}</p>
    `;
  }

  protected onAction(action: string): void {
    if (action === "download") void this.preloader.downloadBook();
  }

  /** Progress: move the bar and the numbers only (a full render per chunk would be wasteful) */
  private update(download: BookDownload): void {
    const stateChanged = download.state !== this.download?.state;
    this.download = download;
    const bar = this.shadowRoot?.querySelector<HTMLElement>(".bar");
    if (stateChanged || !bar) {
      this.render();
      return;
    }
    bar.setAttribute("aria-valuenow", String(percent(download)));
    bar.querySelector("span")!.style.width = `${percent(download)}%`;
    this.shadowRoot!.querySelector(".description")!.textContent =
      i18next.t("settings:downloadProgress", { loaded: megabytes(download.loaded), total: megabytes(download.total) });
  }
}

const percent = ({ loaded, total }: BookDownload): number => (total ? Math.round((loaded / total) * 100) : 100);

/** "24.1 MB" in the reader's language */
const megabytes = (bytes: number): string =>
  new Intl.NumberFormat(i18next.resolvedLanguage, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 })
    .format(bytes / 1_000_000);

customElements.define("settings-download", SettingsDownload);
