import { environments } from "@/environments";
import { GameStoreService, VERSION_PARAM } from "@/services";
import { IGame, IQRCode } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";

export class QRGenerator extends HTMLElement {
  private shadow: ShadowRoot;
  private qrInstance: IQRCode | null = {} as unknown as IQRCode;
  private serverUrl: string =
    environments[import.meta.env.PROD ? "production" : "staging"].url;
  private game: Readonly<IGame>;
  private subscriptionCleanup: (() => void) | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadow);
    this.game = GameStoreService.getInstance();
  }

  async connectedCallback() {
    await this.loadQRScript();
    this.render();
    this.setupListeners();

    // Subscribe to current spread changes only
    this.subscriptionCleanup = this.game.subscribeToProperty('currentSpread', (newSpreadId) => {
      if (newSpreadId) {
        this.generateQR(newSpreadId);
      }
    });
  }

  disconnectedCallback() {
    if (this.subscriptionCleanup) {
      this.subscriptionCleanup();
      this.subscriptionCleanup = null;
    }
  }

  private async loadQRScript(): Promise<void> {
    if (!document.querySelector("#qrcode-script")) {
      return new Promise((resolve) => {
        const script = document.createElement("script");
        script.id = "qrcode-script";
        script.src = "/assets/deps/qrcode.js";
        script.onload = () => resolve();
        document.head.appendChild(script);
      });
    }
  }

  private render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          /* Light panel: the QR code needs a light background */
          background: var(--color-on-dark);
          color: var(--app-background);
          padding: 1rem;
          border-radius: 0;
          max-width: 20rem;
          margin: .5rem auto;
        }
        
        h3 {
          margin-top: 0;
        }
        
        #qr-output {
          display: flex;
          justify-content: center;
          margin: 1rem 0;
        }
        
        #qr-url {
          font-family: monospace;
          font-size: .65rem;
          word-break: break-all;
          opacity: .7;
        }

        .button-row {
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
          margin-top: 1rem;
        }
        
        select {
          width: 100%;
          padding: 0.5rem;
          margin-bottom: 1rem;
          border-radius: 0;
          background: var(--color-on-dark);
          color: var(--app-background);
          border: var(--rule);
          pointer-events: all;
        }
      </style>
      
      <select id="qr-type-selector">
        <option value="valid">Spread link</option>
        <option value="unknown-spread">Link to an unknown spread</option>
      </select>

      <div id="qr-output"></div>
      <div id="qr-url"></div>
      
      <div class="button-row">
        ${goldButton({ label: "Download SVG", shape: "button", attrs: { id: "download" } })}
      </div>
    `;

    const output = this.shadow.getElementById("qr-output");
    if (output && window.QRCode) {
      this.qrInstance = new window.QRCode(output, {
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.H,
        useSVG: true,
      });
    }

    // Generate initial QR code if spread exists
    if (this.game.state.currentSpread) {
      this.generateQR(this.game.state.currentSpread);
    }
  }

  protected setupListeners() {
    const button = this.shadow.getElementById("download");
    button?.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent event from reaching debug overlay
      this.downloadSVG();
    });
    
    const selector = this.shadow.getElementById("qr-type-selector") as HTMLSelectElement;
    if (selector) {
      // Stop propagation of all events on the select element
      selector.addEventListener("click", (e) => e.stopPropagation());
      selector.addEventListener("mousedown", (e) => e.stopPropagation());
      selector.addEventListener("change", (e) => {
        e.stopPropagation();
        const currentSpread = this.game.state.currentSpread;
        if (!currentSpread) return;
        this.generateQR(currentSpread, selector.value);
      });
    }
  }

  private generateQR(spreadId: string, testType: string = "valid") {
    if (!this.qrInstance) return;

    const baseUrl = (__VITE_SERVER_URL__ ? __VITE_SERVER_URL__ : this.serverUrl).replace(/\/$/, "");
    // Link format: services/LinkService.ts – /spread/<id>?osct=<the one app version> (RULES #10)
    const appVersion = this.game.version.version;
    const id = testType === "unknown-spread" ? "no-such-spread" : spreadId;
    const url = `${baseUrl}/spread/${encodeURIComponent(id)}?${VERSION_PARAM}=${appVersion}`;

    this.qrInstance.clear();
    this.qrInstance.makeCode(url);
    const urlOutput = this.shadow.getElementById("qr-url");
    if (urlOutput) urlOutput.textContent = url;
  }

  private downloadSVG() {
    const currentSpread = this.game.state.currentSpread;
    if (!currentSpread) return;
    
    const svg = this.shadow.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `osct-qr-c-${currentSpread}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

  customElements.define("qr-generator", QRGenerator);
