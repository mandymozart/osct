import { environments } from "@/environments";
import { GameStoreService } from "@/services/GameStoreService";
import { IGame } from "@/types";
import { IQRCode, IQRCodeStatic } from "@/types/qr/qrcode";

export class QRGenerator extends HTMLElement {
  private shadow: ShadowRoot;
  private qrInstance: IQRCode | null = {} as unknown as IQRCode;
  private serverUrl: string =
    environments[import.meta.env.PROD ? "production" : "staging"].url;
  private game: Readonly<IGame>;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.game = GameStoreService.getInstance();
  }

  async connectedCallback() {
    if (!import.meta.env.DEV) {
      this.remove();
      return;
    }

    await this.loadQRScript();
    this.render();
    this.setupListeners();

    // Subscribe to game state changes
    this.unsubscribe = this.game.subscribe(() => {
      if (this.game.state.currentChapter) {
        this.generateQR(this.game.state.currentChapter.id);
      }
    });
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
          }
          .qr-container {
            display: flex;
            flex-direction: column;
            gap: .5rem;
            align-items: center;
            position: relative;
            margin-bottom: .5rem;
          }
          #qr-output {
            background: white;
            padding: .5rem;
            border-radius: 0;
            min-height: 200px;
            min-width: 200px;
          }
            button {
            width: 100%;
            }

        </style>
        <div class="qr-container">
          <div id="qr-output"></div>
          <button is="text-button" variant="inverted" size="xs" id="download">Download SVG</button>
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

    // Generate initial QR code if chapter exists
    if (this.game.state.currentChapter) {
      this.generateQR(this.game.state.currentChapter.id);
    }
  }

  protected setupListeners() {
    const button = this.shadow.getElementById("download");
    button?.addEventListener("click", () => this.downloadSVG());
  }

  private generateQR(chapterId: string) {
    if (!this.qrInstance) return;

    const url = `${
      __VITE_SERVER_URL__ ? __VITE_SERVER_URL__ : this.serverUrl
    }/?code=c-${chapterId}`;
    this.qrInstance.clear();
    this.qrInstance.makeCode(url);
  }

  private downloadSVG() {
    if (!this.game?.state?.currentChapter?.id) return;
    const chapterId = this.game.state.currentChapter.id;
    const svg = this.shadow.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `osct-qr-c-${chapterId}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  disconnectedCallback() {
    if (this.qrInstance) {
      this.qrInstance.clear();
    }
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

if (import.meta.env.DEV) {
  customElements.define("qr-generator", QRGenerator);
}
