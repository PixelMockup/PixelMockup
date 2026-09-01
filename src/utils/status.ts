import { rateLimitState } from '../services/microlink';
import { formatResetTime } from './formatResetTime';

export function getRateLimitStatus() {
    if (rateLimitState.remaining === null || rateLimitState.resetAt === null) {
        return "Status: Unknown (No requests made yet)";
    }

    const timeString = formatResetTime(rateLimitState.resetAt);
    return `Remaining: ${rateLimitState.remaining} | ${timeString}`;
}