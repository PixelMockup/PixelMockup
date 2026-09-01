// src/services/microlink.ts

export interface RateLimitState {
    remaining: number | null;
    resetAt: number | null; // Unix timestamp in seconds
    limit: number | null;   // Optional: total limit per cycle
}

// In-memory state. If you run multiple server instances, use Redis instead.
export const rateLimitState: RateLimitState = {
    remaining: null,
    resetAt: null,
    limit: null,
};

export async function fetchMicrolink(targetUrl: string) {
    // Check if we are definitely rate-limited and it hasn't reset yet
    const nowSec = Math.floor(Date.now() / 1000);
    if (rateLimitState.remaining === 0 && rateLimitState.resetAt && rateLimitState.resetAt > nowSec) {
        throw new Error(`Rate limit exceeded. Resets at ${new Date(rateLimitState.resetAt * 1000).toISOString()}`);
    }

    const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(targetUrl)}`);

    // Extract headers from the ACTUAL response
    const remainingHeader = response.headers.get('x-rate-limit-remaining');
    const resetHeader = response.headers.get('x-rate-limit-reset');
    const limitHeader = response.headers.get('x-rate-limit-limit');

    // Update local state
    if (remainingHeader !== null) rateLimitState.remaining = parseInt(remainingHeader, 10);
    if (resetHeader !== null) rateLimitState.resetAt = parseInt(resetHeader, 10);
    if (limitHeader !== null) rateLimitState.limit = parseInt(limitHeader, 10);

    if (!response.ok) {
        if (response.status === 429) {
            console.warn(`[Microlink] Rate limit hit. Resets at: ${rateLimitState.resetAt}`);
        }
        throw new Error(`Microlink API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}