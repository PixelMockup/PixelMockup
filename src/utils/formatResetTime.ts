export function formatResetTime(resetAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = resetAt - now;
  const resetDate = new Date(resetAt * 1000);

  // Explicitly format to user's Local browser timezone
  const timeStr = resetDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  // If the reset time has passed, show the exact UTC time it occurred/is occurring
  if (diff <= 0) return `Reset window reached (UTC: ${timeStr})`;

  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (hours > 0) return `Resets in ${hours}h ${minutes}m (UTC: ${timeStr})`;
  return `Resets in ${minutes}m (${timeStr})`;
}

// If reset time has passed
export function hasResetTimePassed(resetAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return resetAt - now <= 0;
}