/**
 * QR Code Scan Event Detail
 */
export interface QRScanEventDetail {
  data: string;
  timestamp?: number;
}

/**
 * QR Code Scan Event
 */
export interface QRScanEvent extends CustomEvent<QRScanEventDetail>{
  detail: QRScanEventDetail;
  type: 'qr-code-scanned';
}
