/**
 * Website URL validation / normalization and per-device CSS viewports
 * for the screenshot preview and Playwright export capture.
 *
 * Keep this module free of relative imports so the Vite capture plugin
 * (Node / nodenext) can share `normalizeWebsiteUrl` safely.
 */

export interface WebsiteViewport {
  width: number;
  height: number;
}

const PHONE_VIEWPORT: WebsiteViewport = { width: 390, height: 844 };
const TABLET_PORTRAIT: WebsiteViewport = { width: 768, height: 1024 };
const TABLET_LANDSCAPE: WebsiteViewport = { width: 1024, height: 768 };
// Wide enough for a full desktop app shell (sidebar + main content) so SPAs
// do not collapse to a sparse single column on computers/displays.
const DESKTOP_VIEWPORT: WebsiteViewport = { width: 1440, height: 900 };
const WATCH_VIEWPORT: WebsiteViewport = { width: 320, height: 360 };

function isLandscapeName(name: string): boolean {
  return /\bLandscape\b/i.test(name) || /\b90deg\b/i.test(name);
}

/**
 * Normalize user input to an absolute http(s) URL, or null if invalid.
 * Missing scheme → https://. Rejects blank, whitespace-only, and non-http schemes.
 */
export function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  if (!parsed.hostname) return null;

  return parsed.href;
}

export function isValidWebsiteUrl(input: string): boolean {
  return normalizeWebsiteUrl(input) != null;
}

/**
 * CSS viewport used to render and screenshot the site for a device.
 * Height is nominal; the screenshot is cover-scaled into the clipped screen.
 */
export function getWebsiteViewport(
  category: string,
  catalogFileOrName: string,
): WebsiteViewport {
  const cat = category.toLowerCase();
  const name = catalogFileOrName;

  if (cat === 'phones') return { ...PHONE_VIEWPORT };
  if (cat === 'watches') return { ...WATCH_VIEWPORT };
  if (cat === 'tablets') {
    return isLandscapeName(name)
      ? { ...TABLET_LANDSCAPE }
      : { ...TABLET_PORTRAIT };
  }
  // computers, displays, and anything else → desktop
  return { ...DESKTOP_VIEWPORT };
}

/** Hostname for compact UI status (falls back to full URL). */
export function websiteHostname(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

/**
 * Cover-scale a logical viewport into a destination screen size
 * (same idea as object-fit: cover / `coverScale` in coverScale.ts).
 * Inlined so this module stays import-free for the Node capture plugin.
 */
export function coverScaleForViewport(
  viewportW: number,
  viewportH: number,
  destW: number,
  destH: number,
): number {
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  const dw = Math.max(1, destW);
  const dh = Math.max(1, destH);
  return Math.max(dw / vw, dh / vh);
}
