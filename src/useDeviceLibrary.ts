import { useCallback, useMemo, useRef, useState } from 'react';
import type { DeviceItem } from './App';
import deviceDimensions from './data/device_dimensions.json';
import { CATEGORY_ORDER } from './deviceScale';
import { parseBrand, parseProductFamily } from './deviceMeta';

const lazyDeviceFiles = import.meta.glob('./assets/device_library/**/*.svg', {
  eager: false,
  query: '?url',
  import: 'default',
});

type DimEntry = {
  file: string;
  model_key: string;
  width_mm: number | null;
  height_mm: number | null;
};

const dimByFile = new Map<string, DimEntry>();
for (const d of deviceDimensions.devices as DimEntry[]) {
  dimByFile.set(d.file, d);
}

function catalogKeyFromGlobPath(path: string): string {
  const marker = '/device_library/';
  const idx = path.replaceAll('\\', '/').indexOf(marker);
  if (idx >= 0) return path.slice(idx + marker.length);
  const parts = path.split('/');
  const file = parts.pop() ?? '';
  const category = parts.pop() ?? 'uncategorized';
  return `${category}/${file}`;
}

function categoryFromGlobPath(path: string): string {
  const parts = path.replace(/^\.\//, '').split('/');
  return parts.at(-2) ?? 'uncategorized';
}

function buildDeviceItem(path: string, src: string): DeviceItem {
  const pathParts = path.split('/');
  const category = pathParts.at(-2) ?? 'uncategorized';
  const fileName = pathParts.pop()?.replace('.svg', '');
  const catalogFile = catalogKeyFromGlobPath(path);
  const dim = dimByFile.get(catalogFile);
  const brand = parseBrand(fileName);
  const productFamily = parseProductFamily(fileName, category);

  return {
    path,
    src,
    name: fileName,
    category,
    catalogFile,
    modelKey: dim?.model_key ?? '',
    widthMm: dim?.width_mm ?? undefined,
    heightMm: dim?.height_mm ?? undefined,
    brand,
    productFamily,
  };
}

const metadataCatalog: Record<string, DeviceItem[]> = {};
for (const path of Object.keys(lazyDeviceFiles)) {
  const category = categoryFromGlobPath(path);
  if (!metadataCatalog[category]) {
    metadataCatalog[category] = [];
  }
  metadataCatalog[category].push(buildDeviceItem(path, ''));
}

for (const category of Object.keys(metadataCatalog)) {
  metadataCatalog[category].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, {
      sensitivity: 'base',
    }),
  );
}

const missing = Object.values(metadataCatalog)
  .flat()
  .filter((d) => d.widthMm == null || d.heightMm == null);
if (missing.length > 0) {
  console.warn(
    `[Pixel Mockup] ${missing.length} assets missing mm dimensions:`,
    missing.map((d) => d.catalogFile),
  );
}

export interface UseDeviceLibraryResult {
  groupedLibrary: Record<string, DeviceItem[]>;
  categories: string[];
  loadedCategories: Set<string>;
  isLoading: boolean;
  progress: number;
  loadLibrary: (priorityCategory?: string) => Promise<void>;
  loadCategory: (category: string) => Promise<void>;
  loadCategoriesForPreset: (preset: { items: { catalogFile: string }[] }) => Promise<void>;
}

export function useDeviceLibrary(): UseDeviceLibraryResult {
  const [groupedLibrary, setGroupedLibrary] = useState<Record<string, DeviceItem[]>>({});
  const [loadedCategories, setLoadedCategories] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const loadingRef = useRef<Set<string>>(new Set());
  const promisesByCategory = useRef<Record<string, Promise<void>>>({});

  const categories = useMemo(() => {
    const present = new Set(Object.keys(metadataCatalog));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const extras = Object.keys(metadataCatalog)
      .filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c))
      .sort((a, b) => a.localeCompare(b));
    return [...ordered, ...extras];
  }, []);

  const loadCategory = useCallback(
    async (category: string) => {
      if (loadedCategories.has(category)) return;
      if (!metadataCatalog[category]) return;
      if (loadingRef.current.has(category)) {
        await promisesByCategory.current[category];
        return;
      }

      const promise = (async () => {
        loadingRef.current.add(category);
        try {
          const entries = Object.entries(lazyDeviceFiles).filter(
            ([path]) => categoryFromGlobPath(path) === category,
          );

          const items: DeviceItem[] = [];
          await Promise.all(
            entries.map(async ([path, loader]) => {
              const src = (await loader()) as string;
              items.push(buildDeviceItem(path, src));
            }),
          );

          items.sort((a, b) =>
            (a.name ?? '').localeCompare(b.name ?? '', undefined, {
              sensitivity: 'base',
            }),
          );

          setGroupedLibrary((prev) => ({ ...prev, [category]: items }));
          setLoadedCategories((prev) => {
            const next = new Set(prev);
            next.add(category);
            return next;
          });
        } finally {
          loadingRef.current.delete(category);
        }
      })();

      promisesByCategory.current[category] = promise;
      await promise;
    },
    [loadedCategories],
  );

  const loadLibrary = useCallback(
    async (priorityCategory?: string) => {
      if (isLoading) return;
      const all = Object.keys(metadataCatalog);
      if (all.length === 0) return;

      const pending = all.filter((c) => !loadedCategories.has(c));
      if (pending.length === 0) return;

      const order =
        priorityCategory && pending.includes(priorityCategory)
          ? [priorityCategory, ...pending.filter((c) => c !== priorityCategory)]
          : pending;

      setIsLoading(true);
      setProgress(0);
      try {
        for (let i = 0; i < order.length; i++) {
          await loadCategory(order[i]);
          setProgress(((i + 1) / order.length) * 100);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, loadedCategories, loadCategory],
  );

  const loadCategoriesForPreset = useCallback(
    async (preset: { items: { catalogFile: string }[] }) => {
      const needed = new Set(preset.items.map((slot) => slot.catalogFile.split('/')[0]));
      const pending = [...needed].filter((c) => !loadedCategories.has(c));
      if (pending.length === 0) return;

      setIsLoading(true);
      setProgress(0);
      try {
        for (let i = 0; i < pending.length; i++) {
          await loadCategory(pending[i]);
          setProgress(((i + 1) / pending.length) * 100);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [loadedCategories, loadCategory],
  );

  return {
    groupedLibrary,
    categories,
    loadedCategories,
    isLoading,
    progress,
    loadLibrary,
    loadCategory,
    loadCategoriesForPreset,
  };
}
