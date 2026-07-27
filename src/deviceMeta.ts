/** Brand / product-family parsing and ranked token search for the device library. */

const COLOR_FINISH_TOKENS = [
  'arctic silver',
  'coral blue',
  'maple gold',
  'midnight black',
  'orchid gray',
  'burgundy red',
  'lilac purple',
  'sunrise gold',
  'titanium gray',
  'silver titanium',
  'jet black',
  'matte black',
  'rose gold',
  'space grey',
  'space gray',
  'midnight green',
  'clearly white',
  'just black',
  'not pink',
  'product red',
  'alaskan blue',
  'pine green',
  'lemon cream',
  'pink sand',
  'antique white',
  'cool gray',
  'flat silver',
  'midnight blue',
  'ocean blue',
  'light pink',
  'stone grey',
  'black leather',
  'cocoa',
  'concrete',
  'turquoise',
  'lavender',
  'clementine',
  'walnut',
  'cognac',
  'blush',
  'stone',
  'fog',
  'volt',
  'nike',
];

const SIMPLE_COLORS = [
  'black',
  'white',
  'gold',
  'silver',
  'blue',
  'green',
  'red',
  'yellow',
  'purple',
  'coral',
  'pink',
  'grey',
  'gray',
];

export function normalizeDeviceText(input: string): string {
  return input
    .toLowerCase()
    .replace(/-\d+$/g, '')
    .replace(/[_/]+/g, ' ')
    .replaceAll('//', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseBrand(name: string | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return 'Other';
  const lower = n.toLowerCase();

  if (lower.startsWith('apple')) return 'Apple';
  if (lower.startsWith('samsung')) return 'Samsung';
  if (
    lower.startsWith('google') ||
    lower.startsWith('nexus') ||
    lower.startsWith('pixel')
  ) {
    return 'Google';
  }
  if (lower.startsWith('motorola') || lower.startsWith('moto ')) return 'Motorola';
  if (lower.startsWith('htc')) return 'HTC';
  if (lower.startsWith('huawei')) return 'Huawei';
  if (
    lower.startsWith('microsoft') ||
    lower.startsWith('lumia') ||
    lower.startsWith('surface')
  ) {
    return 'Microsoft';
  }
  if (lower.startsWith('dell')) return 'Dell';
  if (lower.startsWith('sony')) return 'Sony';
  return n.split(/\s+/)[0] || 'Other';
}

function stripVariantSuffixes(name: string): string {
  let s = name.trim();
  s = s.replace(/-\d+$/i, '');
  s = s.replace(/\s*-\s*(landscape|portrait)(?:-\d+)?$/i, '');
  s = s.replace(/\s+90deg$/i, '');
  s = s.replace(/\s+(open|closed)$/i, '');
  return s.trim();
}

function tokenBoundryRegex(tok: string): RegExp {
  const spaced = tok.replace(/\s+/g, String.raw`\s+`);
  return new RegExp(String.raw`\s${spaced}\s`, 'ig');
}

function stripColorsAndBands(name: string): string {
  let s = ` ${name} `;
  // "Brand + Band" watch patterns: drop " + …" band/color tails
  s = s.replace(/\s\+\s.+$/i, ' ');

  const finishes = [...COLOR_FINISH_TOKENS].sort((a, b) => b.length - a.length);
  for (const tok of finishes) {
    const re = tokenBoundryRegex(tok);
    s = s.replace(re, ' ');
  }
  for (const tok of SIMPLE_COLORS) {
    const re = tokenBoundryRegex(tok);
    s = s.replace(re, ' ');
  }

  // Trailing " - Color" style
  s = s.replace(/\s-\s+[a-z][a-z\s]*$/i, '');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Human product family label, e.g. "iPhone 11 Pro", "MacBook Air 13-inch",
 * "Galaxy S9", "Apple Watch 40mm".
 */
export function parseProductFamily(
  name: string | undefined,
  _category?: string,
): string {
  if (!name) return 'Unknown';
  let s = stripVariantSuffixes(name);
  s = stripColorsAndBands(s);

  // Drop leading brand for cleaner family labels where redundant
  s = s.replace(/^Apple\s+/i, '');
  s = s.replace(/^Samsung\s+/i, '');
  s = s.replace(/^Google\s+/i, '');
  s = s.replace(/^Microsoft\s+/i, '');
  s = s.replace(/^Dell\s+/i, '');
  s = s.replace(/^Sony\s+/i, '');
  s = s.replace(/^HTC\s+/i, '');
  s = s.replace(/^Huawei\s+/i, '');
  s = s.replace(/^Motorola\s+/i, '');

  // Collapse Sport / Aluminum leftover noise on watches after band strip
  s = s.replace(/\s+(Aluminum|Aluminium|Steel|Titanium|Ceramic|Edition|Sport)\s*$/i, '');
  s = s
    .replace(
      /\s+(Black Steel|Stainless Steel|Space Black|Space Gray|Space Grey|Gold|Silver|Rose Gold)\s*$/i,
      '',
    )
    .trim();

  // Watch: keep "Watch 40mm"
  const watch = /^(?:Apple\s+)?Watch\s+(\d+)\s*mm/i.exec(s);
  if (watch) return `Apple Watch ${watch[1]}mm`;

  if (!s) return name.replace(/-\d+$/, '').trim();
  return s;
}

/**
 * Human-facing device label from filename stem.
 * Keeps color/finish; spaces trailing variant: `Black - 1` → `Black - 1`.
 */
export function formatDeviceDisplayName(name: string | undefined): string {
  const raw = (name ?? '').trim();
  if (!raw) return 'Device';
  return raw.replace(/-(\d+)$/, ' -$1');
}

export interface SearchableDevice {
  name?: string;
  brand: string;
  productFamily: string;
}

/** True if every query token appears in name, brand, or product family. */
export function matchesSearchQuery(
  device: SearchableDevice,
  query: string,
): boolean {
  const q = normalizeDeviceText(query);
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = normalizeDeviceText(
    [device.name ?? '', device.brand, device.productFamily].join(' '),
  );
  return tokens.every((t) => haystack.includes(t));
}

/**
 * Higher score = better match. Prefer product-family / name-prefix hits.
 */
export function scoreSearchMatch(device: SearchableDevice, query: string): number {
  const q = normalizeDeviceText(query);
  if (!q) return 0;
  if (!matchesSearchQuery(device, query)) return -1;

  const name = normalizeDeviceText(device.name ?? '');
  const family = normalizeDeviceText(device.productFamily);
  const brand = normalizeDeviceText(device.brand);
  const tokens = q.split(/\s+/).filter(Boolean);

  let score = 10;
  if (family === q) score += 100;
  else if (family.startsWith(q)) score += 60;
  else if (family.includes(q)) score += 40;

  if (name.startsWith(q)) score += 30;
  if (brand === tokens[0]) score += 15;

  for (const t of tokens) {
    if (family.includes(t)) score += 8;
    if (name.includes(t)) score += 4;
  }

  // Prefer shorter family names (more specific) slightly when tied
  score += Math.max(0, 20 - family.length);

  return score;
}

export function sortBySearchRelevance<T extends SearchableDevice>(
  items: T[],
  query: string,
): T[] {
  const q = query.trim();
  if (!q) {
    return [...items].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
    );
  }
  return [...items]
    .map((item) => ({ item, score: scoreSearchMatch(item, q) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.item.name ?? '').localeCompare(b.item.name ?? '', undefined, {
        sensitivity: 'base',
      });
    })
    .map((x) => x.item);
}

export function toggleInSet(selected: string[], value: string): string[] {
  return selected.includes(value)
    ? selected.filter((v) => v !== value)
    : [...selected, value];
}
