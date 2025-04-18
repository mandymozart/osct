import { PageRoute, Pages } from "@/types/router";

/**
 * Parse a QR code URL and extract chapter information
 * @param url The URL from the QR code (e.g. "https://example.com/?code=c-chapter1&osct=1.0.0")
 * @returns The chapter ID if found
 */
export function parseQRCodeURL(url: string): string | null {
  try {
    // Parse URL to get query parameters
    const parsedUrl = new URL(url);
    const params = new URLSearchParams(parsedUrl.search);
    
    // Check app version if provided
    const osctVersion = params.get('osct');
    const appVersion = import.meta.env.VITE_APP_VERSION;
    
    if (osctVersion && osctVersion !== appVersion) {
      console.warn(`QR code version (${osctVersion}) doesn't match app version (${appVersion})`);
    }
    
    // Extract chapter ID from the code parameter
    const code = params.get('code');
    if (code && code.startsWith('c-')) {
      return code.substring(2); // Remove 'c-' prefix to get chapter ID
    }
    
    return null;
  } catch (error) {
    console.error('Failed to parse QR code URL:', error);
    return null;
  }
}

/**
 * Create route for a chapter from its ID
 * @param chapterId The ID of the chapter
 * @returns PageRoute object for navigation
 */
export function createChapterRoute(chapterId: string): PageRoute {
  return {
    page: Pages.CHAPTER,
    slug: Pages.CHAPTER.toLowerCase(),
    param: {
      key: 'chapterId',
      value: chapterId
    }
  };
}
