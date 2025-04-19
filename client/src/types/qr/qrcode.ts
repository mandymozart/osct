export interface IQRCode {
  /**
   * Make the QRCode
   * @param sText - Link data to encode
   */
  makeCode(sText: string): void;

  /**
   * Make the image from Canvas element
   */
  makeImage(): void;

  /**
   * Clear the QRCode
   */
  clear(): void;
}

export interface IQRCodeStatic {
  /**
   * Error correction levels
   */
  CorrectLevel: {
    L: number;
    M: number;
    Q: number;
    H: number;
  };

  /**
   * Create a new QRCode instance
   * @param el - Target element or 'id' attribute of element
   * @param vOption - Configuration options or text string
   */
  new (el: HTMLElement | string, vOption: string | IQRCodeOptions): IQRCode;
}

export interface IQRCodeOptions {
  /**
   * QRCode link data
   */
  text?: string;

  /**
   * Width of QRCode in pixels
   * @default 256
   */
  width?: number;

  /**
   * Height of QRCode in pixels
   * @default 256
   */
  height?: number;

  /**
   * Type number (1-40)
   * @default 4
   */
  typeNumber?: number;

  /**
   * Color of dark modules
   * @default "#000000"
   */
  colorDark?: string;

  /**
   * Color of light modules
   * @default "#ffffff"
   */
  colorLight?: string;

  /**
   * Error correction level
   * @default QRCode.CorrectLevel.H
   */
  correctLevel?: number;

  /**
   * Use SVG renderer instead of Canvas
   */
  useSVG?: boolean;
}

