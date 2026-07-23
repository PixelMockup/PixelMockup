/** Layer order helpers — array order is truth; do not re-sort by old zIndex. */

export type ZItem = { instanceId: string; zIndex: number };

export function reindexZ<T extends ZItem>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, zIndex: index }));
}

export function byZ<T extends ZItem>(items: T[]): T[] {
  return [...items].sort((a, b) => a.zIndex - b.zIndex);
}

export function bringForwardItems<T extends ZItem>(
  items: T[],
  selectedId: string,
): T[] | null {
  const sorted = byZ(items);
  const index = sorted.findIndex((i) => i.instanceId === selectedId);
  if (index < 0 || index >= sorted.length - 1) return null;
  const next = [...sorted];
  [next[index], next[index + 1]] = [next[index + 1], next[index]];
  return reindexZ(next);
}

export function pushBackwardItems<T extends ZItem>(
  items: T[],
  selectedId: string,
): T[] | null {
  const sorted = byZ(items);
  const index = sorted.findIndex((i) => i.instanceId === selectedId);
  if (index <= 0) return null;
  const next = [...sorted];
  [next[index - 1], next[index]] = [next[index], next[index - 1]];
  return reindexZ(next);
}

export function bringToFrontItems<T extends ZItem>(
  items: T[],
  selectedId: string,
): T[] | null {
  const sorted = byZ(items);
  const index = sorted.findIndex((i) => i.instanceId === selectedId);
  if (index < 0 || index === sorted.length - 1) return null;
  const [item] = sorted.splice(index, 1);
  sorted.push(item);
  return reindexZ(sorted);
}

export function sendToBackItems<T extends ZItem>(
  items: T[],
  selectedId: string,
): T[] | null {
  const sorted = byZ(items);
  const index = sorted.findIndex((i) => i.instanceId === selectedId);
  if (index <= 0) return null;
  const [item] = sorted.splice(index, 1);
  sorted.unshift(item);
  return reindexZ(sorted);
}

export function selectedZRank(
  items: ZItem[],
  selectedId: string | null,
): { index: number; max: number } {
  if (!selectedId) return { index: -1, max: -1 };
  const sorted = byZ(items);
  return {
    index: sorted.findIndex((i) => i.instanceId === selectedId),
    max: sorted.length - 1,
  };
}
