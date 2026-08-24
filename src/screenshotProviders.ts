/**
 * Screenshot provider abstraction.
 * Routes capture requests through the selected cloud provider or local Playwright.
 */

import { storageGet, storageSet } from './storage';

export type ScreenshotProvider = 'playwright' | 'screenshotapi' | 'microlink';

const STORAGE_KEY = 'pixelMockup.screenshotProvider';
const SCREENSHOTAPI_KEY_STORAGE = 'pixelMockup.screenshotApiKey';
const MICROLINK_KEY_STORAGE = 'pixelMockup.microlinkApiKey';

const PROVIDER_VALUES = new Set<ScreenshotProvider>(['playwright', 'screenshotapi', 'microlink']);

export function getScreenshotProvider(): ScreenshotProvider {
  const raw = storageGet(STORAGE_KEY, STORAGE_KEY);
  return PROVIDER_VALUES.has(raw as ScreenshotProvider)
    ? (raw as ScreenshotProvider)
    : 'playwright';
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
): Promise<CaptureResult> {
  if (provider === 'screenshotapi') {
    return captureScreenshotApi(url, width, height, userApiKey);
  }
  if (provider === 'microlink') {
    return captureMicrolink(url, width, height, userApiKey);
  }
  throw new Error('Use captureOne() from captureWebsite.ts for playwright provider');
}

async function captureScreenshotApi(
  url: string,
  width: number,
  height: number,
  userApiKey?: string,
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

  const res = await fetch(`/api/screenshotapi?${params}`, { headers });
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

  const res = await fetch(`/api/microlink-capture?${params}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `Microlink failed (${res.status})`);
  }

  const mime = res.headers.get('content-type') ?? 'image/png';
  const bytes = await res.arrayBuffer();
  const dataUrl = bytesToDataUrl(bytes, mime);

  const remaining = res.headers.get('x-rate-limit-remaining');
  const creditsRemaining = remaining != null ? Number(remaining) : null;

  return { dataUrl, creditsRemaining, provider: 'microlink' };
}
