/**
 * Screenshot provider abstraction.
 * Routes capture requests through the selected cloud provider or local Playwright.
 */

import { sign } from 'crypto';
import { storageGet, storageSet } from './storage';
import type { Provider } from './types/screenshot';

export type ScreenshotProvider = 'playwright' | Provider;

interface ScreenshotResult {
  dataUrl: string;
  provider: ScreenshotProvider;
}

export interface ProviderConfig {
  apiKey?: string;
  provider: ScreenshotProvider;
}

const STORAGE_KEY = 'pixelMockup.screenshotProvider';
const SCREENSHOTAPI_KEY_STORAGE = 'pixelMockup.screenshotApiKey';
const MICROLINK_KEY_STORAGE = 'pixelMockup.microlinkApiKey';
const SCREENSHOT_API_ENDPOINT = 'https://shot.screenshotapi.net/screenshot';
const MICROLINK_ENDPOINT = 'https://api.microlink.io';

const PROVIDER_VALUES = new Set<ScreenshotProvider>(['playwright', 'screenshotapi', 'microlink']);


export function getScreenshotProvider(): ScreenshotProvider {
  const raw = storageGet(STORAGE_KEY, STORAGE_KEY);
  return PROVIDER_VALUES.has(raw as ScreenshotProvider)
    ? (raw as ScreenshotProvider)
    : 'microlink';
}

export function setScreenshotProvider(provider: ScreenshotProvider): void {
  storageSet(STORAGE_KEY, provider);
}

export function getScreenshotApiKey(): string {
  return storageGet(SCREENSHOTAPI_KEY_STORAGE, SCREENSHOTAPI_KEY_STORAGE) ?? '';
}

export function setScreenshotApiKey(key: string): void {
  storageSet(SCREENSHOTAPI_KEY_STORAGE, key);
}

export function getMicrolinkApiKey(): string {
  return storageGet(MICROLINK_KEY_STORAGE, MICROLINK_KEY_STORAGE) ?? '';
}

export function setMicrolinkApiKey(key: string): void {
  storageSet(MICROLINK_KEY_STORAGE, key);
}

export interface CaptureResult {
  dataUrl: string;
  creditsRemaining: number | null;
  provider: ScreenshotProvider;
  /** Microlink daily usage cap. */
  limit?: number | null;
  /** Unix epoch (seconds) when the Microlink daily quota resets. */
  resetAt?: number | null;
}

/**
 * Capture using Microlink.io
 * Docs: https://microlink.io/docs/api/getting-started/overview
 * Free tier: 100 req/day per IP, no API key required
 */
async function captureWithMicrolink(
  url: string,
  width: number,
  height: number,
  apiKey?: string,
  signal?: AbortSignal
): Promise<string> {
  const params = new URLSearchParams({
    url: url,
    screenshot: 'true',
    'screenshot.type': 'png',
    'screenshot.width': String(width),
    'screenshot.height': String(height),
    embed: 'screenshot.url',
  });
  const headers: Record<string, string> = {};

  if (apiKey) {
    params.set('apiKey', apiKey);
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(`${MICROLINK_ENDPOINT}?${params}`, { headers, signal });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Microlink error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Microlink returns { data: { screenshot: { url: "..." } } }
  const screenshotUrl = data?.data?.screenshot?.url;

  if (!screenshotUrl) {
    throw new Error('Microlink response missing screenshot URL');
  }

  // Fetch the actual image from the returned URL
  const imageResponse = await fetch(screenshotUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch Microlink screenshot: ${imageResponse.status}`);
  }

  const blob = await imageResponse.blob();
  return await blobToDataUrl(blob);
}

/**
 * Convert Blob to data URL
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Local Playwright capture via Vite middleware
 * Only works when running `npm run dev` or `npm run preview`
 */
async function captureWithLocalPlaywright(
  url: string,
  width: number,
  height: number,
  signal?: AbortSignal
): Promise<string> {
  const CAPTURE_ENDPOINT = '/__capture_website';

  // retry logic for 429 (too many captures)
  const BUSY_RETRIES = 1;
  const BUSY_RETRY_DELAY_MS = 500;

  for (let attempt = 0; attempt <= BUSY_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const response = await fetch(CAPTURE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, width, height }),
      signal,
    });

    if (response.ok) {
      const data = await response.json();
      if (!data.dataUrl || !data.dataUrl.startsWith('data:image/png;base64,')) {
        throw new Error(`Invalid capture payload from Playwright`);
      }
      return data.dataUrl;
    }

    // retry on 429
    if (response.status === 429 && attempt < BUSY_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, BUSY_RETRY_DELAY_MS));
      continue;
    }

    let isHtml = false;
    const data = await response.json().catch(() => { isHtml = true; return {}; });

    // ✅ Short-circuit if the endpoint is missing (404 HTML response)
    if (response.status === 404 && isHtml) {
      const err = new Error('capture server unavailable');
      (err as any).isCaptureUnavailable = true;
      throw err;
    }
    throw new Error(data.error || `Playwright capture failed: ${response.status}`);
  }
  throw new Error('Playwright capture failed: max retries exceeded');
}

/**
 * Main capture function with fallback logic
 * 
 * @param url - Target URL to capture
 * @param width - Viewport width
 * @param height - Viewport height
 * @param userConfig - User's preferred provider/API key (optional)
 * @param appApiKey - App's default ScreenshotAPI key (optional)
*/

export async function captureWithFallback(
  url: string,
  width: number,
  height: number,
  userConfig?: ProviderConfig,
  appApiKey?: string,
  signal?: AbortSignal
): Promise<ScreenshotResult> {
  const errors: Array<{ provider: string; error: string }> = [];

  // Priority 1: User's preferred provider
  if (userConfig?.apiKey && userConfig.provider === 'screenshotapi') {
    try {
      const dataUrl = await captureWithScreenshotApi(url, width, height, userConfig.apiKey);
      return { dataUrl, provider: 'screenshotapi' };
    } catch (err) {
      errors.push({
        provider: 'screenshotapi (user key)',
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  if (userConfig?.apiKey && userConfig.provider === 'microlink') {
    try {
      const dataUrl = await captureWithMicrolink(url, width, height, userConfig.apiKey, signal);
      return { dataUrl, provider: 'microlink' };
    } catch (err) {
      errors.push({
        provider: 'microlink (user key)',
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // Priority 2: Try local Playwright (only works in dev with npm run dev)
  try {
    const dataUrl = await captureWithLocalPlaywright(url, width, height, signal);
    return { dataUrl, provider: 'playwright' };
  } catch (err) {
    errors.push({
      provider: 'playwright',
      error: err instanceof Error ? err.message : String(err)
    });
  }

  // Priority 3: App's default ScreenshotAPI key
  if (appApiKey) {
    try {
      const dataUrl = await captureWithScreenshotApi(url, width, height, appApiKey);
      return { dataUrl, provider: 'screenshotapi' };
    } catch (err) {
      errors.push({
        provider: 'screenshotapi (app key)',
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // Priority 4: Microlink free tier (no key needed)
  try {
    const dataUrl = await captureWithMicrolink(url, width, height, signal);
    return { dataUrl, provider: 'microlink' };
  } catch (err) {
    errors.push({
      provider: 'microlink',
      error: err instanceof Error ? err.message : String(err)
    });
  }

  // All providers failed
  const errorSummary = errors.map(e => `${e.provider}: ${e.error}`).join('\n');
  throw new Error(`All screenshot providers failed:\n${errorSummary}`);
}

/**
 * Convert raw image bytes to a data URL.
 */
function bytesToDataUrl(bytes: ArrayBuffer, mime: string): string {
  const base64 = btoa(
    new Uint8Array(bytes).reduce((data, byte) => data + String.fromCharCode(byte), ''),
  );
  return `data:${mime};base64,${base64}`;
}

/**
 * Capture a screenshot through the selected cloud provider.
 * Returns the image as a data URL plus remaining credits from the response header.
 */
export async function captureWithProvider(
  url: string,
  width: number,
  height: number,
  provider: ScreenshotProvider,
  userApiKey?: string,
  signal?: AbortSignal
): Promise<CaptureResult> {
  if (provider === 'screenshotapi') {
    return captureScreenshotApi(url, width, height, userApiKey, signal);
  }
  if (provider === 'microlink') {
    return captureMicrolink(url, width, height, userApiKey, signal);
  }
  throw new Error('Use captureOne() from captureWebsite.ts for playwright provider');
}

/**
 * Capture using ScreenshotAPI.net
 * Docs: https://screenshotapi.net/documentation
 */
async function captureWithScreenshotApi(
  url: string,
  width: number,
  height: number,
  apiKey: string,
  signal?: AbortSignal
): Promise<string> {
  const params = new URLSearchParams({
    token: apiKey,
    url: url,
    width: String(width),
    height: String(height),
    output: 'image',
    file_type: 'png',
    wait_for_event: 'load',
    fresh: 'false', // Use cached if available
  });

  const response = await fetch(`${SCREENSHOT_API_ENDPOINT}?${params}`, { signal });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ScreenshotAPI error: ${response.status} - ${error}`);
  }

  const bytes = await response.arrayBuffer();
  const mime = response.headers.get('content-type') ?? 'image/png';
  return bytesToDataUrl(bytes, mime);
}

async function captureScreenshotApi(
  url: string,
  width: number,
  height: number,
  userApiKey?: string,
  signal?: AbortSignal
): Promise<CaptureResult> {
  const params = new URLSearchParams({
    url,
    width: String(Math.min(1920, Math.max(1, Math.round(width)))),
    height: String(Math.min(10000, Math.max(1, Math.round(height)))),
    type: 'png',
  });

  const headers: Record<string, string> = {};
  if (userApiKey) {
    headers['x-api-key'] = userApiKey;
  }

  const res = await fetch(`/api/screenshotapi?${params}`, { headers, signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `ScreenshotAPI failed (${res.status})`);
  }

  const mime = res.headers.get('content-type') ?? 'image/png';
  const bytes = await res.arrayBuffer();
  const dataUrl = bytesToDataUrl(bytes, mime);

  const remaining = res.headers.get('x-credits-remaining');
  const creditsRemaining = remaining != null ? Number(remaining) : null;

  return { dataUrl, creditsRemaining, provider: 'screenshotapi' };
}

async function captureMicrolink(
  url: string,
  width: number,
  height: number,
  userApiKey?: string,
  signal?: AbortSignal
): Promise<CaptureResult> {
  const params = new URLSearchParams({
    url,
    screenshot: 'true',
    meta: 'false',
    'screenshot.width': String(Math.min(1920, Math.max(1, Math.round(width)))),
    'screenshot.height': String(Math.min(1080, Math.max(1, Math.round(height)))),
    embed: 'screenshot.url',
  });

  const headers: Record<string, string> = {};
  if (userApiKey) {
    headers['x-api-key'] = userApiKey;
  }

  const res = await fetch(`/api/microlink-capture?${params}`, { headers, signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `Microlink failed (${res.status})`);
  }

  const mime = res.headers.get('content-type') ?? 'image/png';
  const bytes = await res.arrayBuffer();
  const dataUrl = bytesToDataUrl(bytes, mime);

  const remaining = res.headers.get('x-rate-limit-remaining');
  const creditsRemaining = remaining != null ? Number(remaining) : null;

  const limitHeader = res.headers.get('x-rate-limit-limit');
  const limit = limitHeader != null ? Number(limitHeader) : null;
  const resetHeader = res.headers.get('x-rate-limit-reset');
  const resetAt = resetHeader != null ? Number(resetHeader) : null;

  return { dataUrl, creditsRemaining, provider: 'microlink', limit, resetAt };
}
