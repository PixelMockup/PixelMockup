/**
 * Client helper for the Vercel serverless HTML proxy (`api/proxy.ts`).
 * Live iframe preview on static hosts loads sites through `/api/proxy` to
 * bypass X-Frame-Options / CSP frame-ancestors. Local dev and Docker have no
 * such endpoint, so the probe falls back to direct iframes there.
 */

import { normalizeWebsiteUrl } from './websiteUrl';

const PROXY_PATH = '/api/proxy';

type ProxyEndpointState = 'unknown' | 'available' | 'unavailable';
let proxyEndpointState: ProxyEndpointState = 'unknown';
let proxyProbeInFlight: Promise<boolean> | null = null;

/** Proxied iframe src for a website URL. */
export function buildProxyUrl(url: string): string {
  return `${PROXY_PATH}?url=${encodeURIComponent(url)}`;
}

/** URLs already pre-warmed this session. */
const warmedUrls = new Set<string>();

/**
 * Pre-fetch a site through the proxy so the first iframe view hits a warm
 * server/CDN cache instead of paying DNS + upstream TTFB. Fire-and-forget;
 * never throws (plain `npm run dev` has no proxy and just 404s). Failed
 * warms are retried on the next call so a cold proxy can recover.
 */
export function warmProxy(url: string): void {
  const target = normalizeWebsiteUrl(url);
  if (!target || warmedUrls.has(target)) return;
  warmedUrls.add(target);
  void fetch(buildProxyUrl(target)).catch(() => {
    warmedUrls.delete(target);
  });
}

/**
 * Whether `/api/proxy` exists on this host. One cheap JSON probe; the SPA
 * fallback on static/local servers returns HTML instead of JSON. Cached.
 */
export function probeProxyAvailable(): Promise<boolean> {
  if (proxyEndpointState === 'available') return Promise.resolve(true);
  if (proxyEndpointState === 'unavailable') return Promise.resolve(false);

  if (!proxyProbeInFlight) {
    proxyProbeInFlight = fetch(`${PROXY_PATH}?probe=1`)
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as {
          ok?: unknown;
        } | null;
        return data != null && typeof data === 'object' && data.ok === true;
      })
      .catch(() => false)
      .then((ok) => {
        proxyEndpointState = ok ? 'available' : 'unavailable';
        return ok;
      })
      .finally(() => {
        proxyProbeInFlight = null;
      });
  }
  return proxyProbeInFlight;
}

/** Test helper — reset the one-shot probe between cases. */
export function resetProxyAvailabilityForTests(): void {
  proxyEndpointState = 'unknown';
  proxyProbeInFlight = null;
}

/** Test helper — force the one-shot probe result between cases. */
export function setProxyAvailableForTests(available: boolean): void {
  proxyEndpointState = available ? 'available' : 'unavailable';
  proxyProbeInFlight = null;
}
