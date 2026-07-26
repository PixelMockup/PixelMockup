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

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets;
}

function isBlockedIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  // 0.0.0.0/8, 127.0.0.0/8
  if (a === 0 || a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (link-local + cloud metadata)
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedIpv6(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === '::1' || h === '::') return true;
  // Expand a leading compressed form enough to check prefixes.
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // fc00::/7 ULA
  if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  // IPv4-mapped IPv6: ::ffff:a.b.c.d (dotted)
  const dotted = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (dotted) {
    const octets = parseIpv4(dotted[1]);
    return octets != null && isBlockedIpv4(octets);
  }
  // IPv4-mapped IPv6: ::ffff:XXXX:YYYY (hex)
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const hi = Number.parseInt(hex[1], 16);
    const lo = Number.parseInt(hex[2], 16);
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return true;
    const octets = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
    return isBlockedIpv4(octets);
  }
  return false;
}

/**
 * True for loopback, link-local, private, CGNAT, ULA, and metadata addresses,
 * plus localhost hostnames. Used by URL normalization and post-DNS checks.
 */
export function isBlockedAddress(hostnameOrIp: string): boolean {
  const host = hostnameOrIp.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;

  const ipv4 = parseIpv4(host);
  if (ipv4) return isBlockedIpv4(ipv4);

  if (host.includes(':')) return isBlockedIpv6(host);

  return false;
}

/**
 * Normalize user input to an absolute http(s) URL, or null if invalid.
 * Missing scheme → https://. Rejects blank, whitespace-only, non-http schemes,
 * embedded credentials, and literal private/loopback/metadata hosts.
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
  if (parsed.username || parsed.password) return null;
  if (isBlockedAddress(parsed.hostname)) return null;

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
