import { goldButton } from "@/components/buttons";
import i18next from "i18next";
import { BookDownload, InstallService, PreloaderService } from "@/services";
import { SettingsSection } from "./settings-section";

/**
 * "Download all content" (Tilman 2026-09-27): loads every content file in advance, so nothing has to load
 * while the reader uses the app (and it works offline). A progress bar always shows how much of the total
 * size is on this device – before (partly, from browsing), while it runs (it goes on when the page closes)
 * and when done. Only where the download lasts (`InstallService.keepsDownloads`: not in iOS Safari tabs);
 * elsewhere the section is not there. No "clear" – removing the app removes it.
 */
export class SettingsDownload extends SettingsSection {
  private preloader = PreloaderService.getInstance();
  private download: BookDownload | null = null;
  private unsubscribe?: () => void;

  connectedCallback() {
    if (!InstallService.getInstance().keepsDownloads()) {
      this.remove();
      return;
    }
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
    const description = download.state === "done" ? i18next.t("settings:downloadDone", { size: total })
      : download.state === "failed" ? i18next.t("settings:downloadFailed", { size: total })
      : download.state === "idle" ? i18next.t("settings:downloadDescription", { size: total })
      : "";
    return /* html */ `
      <style>
        .bar { height: .5rem; margin-top: .75rem; border-radius: .25rem; overflow: hidden; border: var(--rule); }
        .bar span { display: block; height: 100%; background: var(--gold-gradient); transition: width .2s linear; }
        .amount { margin: .35rem 0 0; color: var(--color-muted); font-size: var(--text-size-small); }
      </style>
      ${button}
      <div class="bar" role="progressbar" aria-label="${i18next.t("settings:downloadButton")}"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent(download)}">
        <span style="width: ${percent(download)}%"></span>
      </div>
      <p class="amount">${amount(download)}</p>
      ${description ? `<p class="description" role="status">${description}</p>` : ""}
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
    this.shadowRoot!.querySelector(".amount")!.textContent = amount(download);
  }
}

const percent = ({ loaded, total }: BookDownload): number => (total ? Math.round((loaded / total) * 100) : 100);

/** "5 MB of 20.2 MB downloaded" (while running) / "… on this device" */
const amount = (download: BookDownload): string =>
  i18next.t(download.state === "running" ? "settings:downloadProgress" : "settings:downloadStored",
    { loaded: megabytes(download.loaded), total: megabytes(download.total) });

/** "24.1 MB" in the reader's language */
const megabytes = (bytes: number): string =>
  new Intl.NumberFormat(i18next.resolvedLanguage, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 })
    .format(bytes / 1_000_000);

customElements.define("settings-download", SettingsDownload);
