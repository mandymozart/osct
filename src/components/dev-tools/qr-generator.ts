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
          background: var(--color-background);
          color: var(--color-primary);
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
          background: var(--color-background);
          color: var(--color-primary);
          border: 1px solid var(--color-border);
          pointer-events: all;
        }
      </style>
      
      <select id="qr-type-selector">
        <option value="valid">Valid Chapter QR</option>
        <option value="invalid-code">Invalid Code Format</option>
        <option value="wrong-chapter">Non-existent Chapter</option>
        <option value="wrong-version">Wrong App Version</option>
        <option value="plain-text">Plain Text (Non-URL)</option>
      </select>
      
      <div id="qr-output"></div>
      
      <div class="button-row">
        <button is="text-button" id="download" class="button" variant="inverted" size="xs">Download SVG</button>
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
        if (!this.game.state.currentChapter) return;
        this.generateQR(this.game.state.currentChapter.id, selector.value);
      });
    }
  }

  private generateQR(chapterId: string, testType: string = "valid") {
    if (!this.qrInstance) return;

    let url = "";
    
    switch(testType) {
      case "invalid-code":
        // Missing the 'c-' prefix for chapter code
        url = `${
          __VITE_SERVER_URL__ ? __VITE_SERVER_URL__ : this.serverUrl
        }/?code=${chapterId}&osct=${import.meta.env.VITE_APP_VERSION}`;
        break;
        
      case "wrong-chapter":
        // Non-existent chapter ID
        url = `${
          __VITE_SERVER_URL__ ? __VITE_SERVER_URL__ : this.serverUrl
        }/?code=c-nonexistent123&osct=${import.meta.env.VITE_APP_VERSION}`;
        break;
        
      case "wrong-version":
        // Wrong app version
        url = `${
          __VITE_SERVER_URL__ ? __VITE_SERVER_URL__ : this.serverUrl
        }/?code=c-${chapterId}&osct=999.0.0`;
        break;
        
      case "plain-text":
        // Non-URL text to trigger format error
        url = `This is not a URL format`;
        break;
        
      case "valid":
      default:
        // Standard valid QR code
        url = `${
          __VITE_SERVER_URL__ ? __VITE_SERVER_URL__ : this.serverUrl
        }/?code=c-${chapterId}&osct=${import.meta.env.VITE_APP_VERSION}`;
        break;
    }
    
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
