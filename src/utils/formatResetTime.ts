export function formatResetTime(resetAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = resetAt - now;
  if (diff <= 0) return "Resets momentarily";
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const resetDate = new Date(resetAt * 1000);
  const timeStr = resetDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (hours > 0) return `Resets in ${hours}h ${minutes}m (${timeStr})`;
  return `Resets in ${minutes}m (${timeStr})`;
}
