import { asset } from "$app/paths";
import type { AssetPath } from "$app/types";

/**
 * QR codes as SVG for print (#326): the admin's *A new code* draws the address of a printed code as a vector image to
 * download. The modules come from the QR library the reader's landing page and dev tools use too (davidshimjs/qrcodejs,
 * `static/vendor/qrcode.js` – a copy of `client/public/assets/deps/qrcode.js`); the SVG is ours: one path, black on
 * white, a quiet zone of four modules.
 */

interface QrModel {
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
interface QrInstance {
  _oQRCode: QrModel | null;
}
interface QrStatic {
  new (el: HTMLElement, options: { text: string; width: number; height: number; correctLevel: number }): QrInstance;
  CorrectLevel: { L: number; M: number; Q: number; H: number };
}

const SCRIPT_ID = "osct-qrcode";
let loading: Promise<QrStatic> | null = null;

const qrStatic = (): QrStatic | undefined => (window as unknown as { QRCode?: QrStatic }).QRCode;

/** Loads the QR library once */
export const loadQr = (): Promise<QrStatic> => {
  const ready = qrStatic();
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = asset("/vendor/qrcode.js" as AssetPath);
    script.onload = () => {
      const loaded = qrStatic();
      if (loaded) resolve(loaded);
      else reject(new Error("qrcode.js"));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("qrcode.js"));
    };
    document.head.appendChild(script);
  });
  return loading;
};

/** The modules of a QR code as rows of booleans (dark = true) */
export const qrModules = (QR: QrStatic, text: string): boolean[][] => {
  const qr = new QR(document.createElement("div"), { text, width: 64, height: 64, correctLevel: QR.CorrectLevel.M });
  const model = qr._oQRCode;
  if (!model) return [];
  const n = model.getModuleCount();
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => model.isDark(row, col)));
};

/** The SVG of a QR code's modules: one path, black on white, a quiet zone of `quiet` modules around it */
export const qrSvg = (modules: readonly (readonly boolean[])[], quiet = 4): string => {
  const n = modules.length;
  const size = n + 2 * quiet;
  let path = "";
  modules.forEach((row, y) => {
    // Runs of dark modules in a row: one rectangle each
    let x = 0;
    while (x < n) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < n && row[x]) x++;
      path += `M${start + quiet} ${y + quiet}h${x - start}v1h-${x - start}z`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
};
