// File: qrScanner.js
import jsQR from 'jsqr';

interface QRScannerElements {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

let videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement,
    canvasContext: CanvasRenderingContext2D | null;
let scanningActive = false;
interface QRCodeCallback {
  (chapterId: string): void;
}

let onCodeScanned: QRCodeCallback | null = null;

// TODO: refactor into a webcomponent and complete strict typing

export function initQRScanner(callback: QRCodeCallback): void {
  // Create and configure elements
  videoElement = document.getElementById('qr-video') as HTMLVideoElement;
  canvasElement = document.getElementById('qr-canvas') as HTMLCanvasElement;
  canvasContext = canvasElement.getContext('2d');

  if (!videoElement) {
    throw new Error("Video element is missing");
  }
  if(!canvasElement) {
    throw new Error("Canvas element is missing");
  }
  
  // Store callback
  onCodeScanned = callback;
}

export function startQRScanner() {
  if (scanningActive) return;
  
  // Request camera access
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      videoElement.srcObject = stream;
      videoElement.setAttribute('playsinline', 'true'); // Required for iOS
      videoElement.play();
      scanningActive = true;
      requestAnimationFrame(scanQRCode);
    })
    .catch(error => {
      console.error('Error accessing camera:', error);
      alert('Failed to access camera. Please check permissions.');
    });
}

export function stopQRScanner() {
  if (!scanningActive) return;
  
  // Stop all video tracks
  const stream = videoElement.srcObject as MediaStream;
  if (stream) {
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop());
    videoElement.srcObject = null;
  }
  
  scanningActive = false;
}

function scanQRCode() {
  if (!scanningActive) return;
  
  // Check if video is ready
  if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
    // Set canvas to video dimensions
    canvasElement.height = videoElement.videoHeight;
    canvasElement.width = videoElement.videoWidth;
    
    // Draw video frame to canvas
    if (!canvasContext) {
      throw new Error("Canvas context is null");
    }
    canvasContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // Get image data for QR processing
    const imageData = canvasContext.getImageData(0, 0, canvasElement.width, canvasElement.height);
    
    // Process with jsQR
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
      // Valid QR code found, check if it's a chapter code
      console.log('QR code detected:', code.data);
      
      // Validate code format (expected: "chapter:X")
      if (code.data.startsWith('chapter:')) {
        const chapterId = code.data.split(':')[1];
        
        // Call the callback with the chapter ID
        if (onCodeScanned) {
          onCodeScanned(chapterId);
        }
        
        // Pause scanning briefly
        scanningActive = false;
        setTimeout(() => {
          if (videoElement.srcObject) {
            scanningActive = true;
            requestAnimationFrame(scanQRCode);
          }
        }, 2000);
        
        return;
      }
    }
  }
  
  // Continue scanning
  if (scanningActive) {
    requestAnimationFrame(scanQRCode);
  }
}