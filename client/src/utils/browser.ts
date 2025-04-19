/**
 * Simple browser detection for tailoring instructions
 * @returns Browser identifier: 'chrome', 'firefox', 'safari', or 'unknown'
 */
export function detectBrowser(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.indexOf('chrome') > -1) return 'chrome';
  if (userAgent.indexOf('firefox') > -1) return 'firefox';
  if (userAgent.indexOf('safari') > -1) return 'safari';
  
  return 'unknown';
}
