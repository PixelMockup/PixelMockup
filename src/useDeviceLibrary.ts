import { useCallback, useMemo, useRef, useState } from 'react';
import type { DeviceItem } from './App';
import deviceDimensions from './assets/device_dimensions.json';
import { CATEGORY_ORDER } from './deviceScale';
import { isPriorityPhone, parseBrand, parseProductFamily } from './deviceMeta';

const lazyDeviceFiles = import.meta.glob('./assets/device_library/**/*.svg', {
  eager: false,
  query: '?url',
  import: 'default',
});

const CATEGORY_LOAD_CONCURRENCY = 6;
const PRIORITY_FULL_CATEGORIES = ['computers', 'displays', 'tablets'] as const;

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

function cloneMetadataCatalog(): Record<string, DeviceItem[]> {
  const next: Record<string, DeviceItem[]> = {};
  for (const [category, items] of Object.entries(metadataCatalog)) {
    next[category] = items.map((item) => ({ ...item }));
  }
  return next;
}

function categoryIsFullyLoaded(items: DeviceItem[] | undefined): boolean {
  return !!items && items.length > 0 && items.every((item) => item.src !== '');
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export interface UseDeviceLibraryResult {
  groupedLibrary: Record<string, DeviceItem[]>;
  categories: string[];
  loadedCategories: Set<string>;
  loadingDevicePaths: Set<string>;
  isLoading: boolean;
  progress: number;
  /** Live human-readable status for the current load phase. */
  statusMessage: string | null;
  loadLibrary: (priorityCategory?: string) => Promise<void>;
  loadPriorityLibrary: () => Promise<void>;
  loadCategory: (category: string) => Promise<void>;
  loadDevice: (path: string) => Promise<DeviceItem | null>;
  loadCategoriesForPreset: (preset: { items: { catalogFile: string }[] }) => Promise<void>;
}

export function useDeviceLibrary(): UseDeviceLibraryResult {
  const [groupedLibrary, setGroupedLibrary] = useState<Record<string, DeviceItem[]>>(
    cloneMetadataCatalog,
  );
  const [loadedCategories, setLoadedCategories] = useState<Set<string>>(() => new Set());
  const [loadingDevicePaths, setLoadingDevicePaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const loadingCategoriesRef = useRef<Set<string>>(new Set());
  const categoryPromisesRef = useRef<Record<string, Promise<void>>>({});
  const devicePromisesRef = useRef<Record<string, Promise<DeviceItem | null>>>({});
  const groupedLibraryRef = useRef(groupedLibrary);
  groupedLibraryRef.current = groupedLibrary;

  const categories = useMemo(() => {
    const present = new Set(Object.keys(metadataCatalog));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const extras = Object.keys(metadataCatalog)
      .filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c))
      .sort((a, b) => a.localeCompare(b));
    return [...ordered, ...extras];
  }, []);

  const loadDevice = useCallback(async (path: string): Promise<DeviceItem | null> => {
    const existing = Object.values(groupedLibraryRef.current)
      .flat()
      .find((item) => item.path === path);
    if (existing?.src) return existing;

    const pending = devicePromisesRef.current[path];
    if (pending) return pending;

    const loader = lazyDeviceFiles[path];
    if (!loader) return null;

    const promise = (async () => {
      setLoadingDevicePaths((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
      try {
        const src = (await loader()) as string;
        const item = buildDeviceItem(path, src);
        setGroupedLibrary((prev) => {
          const category = item.category;
          const list = prev[category] ?? metadataCatalog[category] ?? [];
          const nextList = list.map((d) => (d.path === path ? item : d));
          if (!nextList.some((d) => d.path === path)) {
            nextList.push(item);
            nextList.sort((a, b) =>
              (a.name ?? '').localeCompare(b.name ?? '', undefined, {
                sensitivity: 'base',
              }),
            );
          }
          if (categoryIsFullyLoaded(nextList)) {
            setLoadedCategories((loaded) => {
              if (loaded.has(category)) return loaded;
              const next = new Set(loaded);
              next.add(category);
              return next;
            });
          }
          return { ...prev, [category]: nextList };
        });
        return item;
      } finally {
        setLoadingDevicePaths((prev) => {
          if (!prev.has(path)) return prev;
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        delete devicePromisesRef.current[path];
      }
    })();

    devicePromisesRef.current[path] = promise;
    return promise;
  }, []);

  const loadCategory = useCallback(
    async (category: string) => {
      if (!metadataCatalog[category]) return;
      if (loadedCategories.has(category)) return;
      if (categoryIsFullyLoaded(groupedLibraryRef.current[category])) {
        setLoadedCategories((prev) => {
          if (prev.has(category)) return prev;
          const next = new Set(prev);
          next.add(category);
          return next;
        });
        return;
      }
      if (loadingCategoriesRef.current.has(category)) {
        await categoryPromisesRef.current[category];
        return;
      }

      const promise = (async () => {
        loadingCategoriesRef.current.add(category);
        try {
          const entries = Object.entries(lazyDeviceFiles).filter(
            ([path]) => categoryFromGlobPath(path) === category,
          );
          const current = groupedLibraryRef.current[category] ?? [];
          const alreadyLoaded = new Set(
            current.filter((d) => d.src).map((d) => d.path),
          );
          const pending = entries.filter(([path]) => !alreadyLoaded.has(path));

          const loadedItems = await mapPool(
            pending,
            CATEGORY_LOAD_CONCURRENCY,
            async ([path, loader]) => {
              const src = (await loader()) as string;
              return buildDeviceItem(path, src);
            },
          );

          setGroupedLibrary((prev) => {
            const byPath = new Map(
              (prev[category] ?? metadataCatalog[category] ?? []).map((d) => [
                d.path,
                d,
              ]),
            );
            for (const item of loadedItems) {
              byPath.set(item.path, item);
            }
            const items = [...byPath.values()].sort((a, b) =>
              (a.name ?? '').localeCompare(b.name ?? '', undefined, {
                sensitivity: 'base',
              }),
            );
            return { ...prev, [category]: items };
          });
          setLoadedCategories((prev) => {
            const next = new Set(prev);
            next.add(category);
            return next;
          });
        } finally {
          loadingCategoriesRef.current.delete(category);
          delete categoryPromisesRef.current[category];
        }
      })();

      categoryPromisesRef.current[category] = promise;
      await promise;
    },
    [loadedCategories],
  );

  const loadPriorityLibrary = useCallback(async () => {
    if (isLoading) return;

    const fullCategories = PRIORITY_FULL_CATEGORIES.filter(
      (c) => metadataCatalog[c] && !loadedCategories.has(c),
    );
    const phoneMeta = metadataCatalog.phones ?? [];
    const priorityPhonePaths = phoneMeta
      .filter((d) => isPriorityPhone(d.name))
      .map((d) => d.path)
      .filter((path) => {
        const current = groupedLibraryRef.current.phones?.find((d) => d.path === path);
        return !current?.src;
      });

    const totalUnits = fullCategories.length + (priorityPhonePaths.length > 0 ? 1 : 0);
    if (totalUnits === 0) return;

    setIsLoading(true);
    setProgress(0);
    let completed = 0;
    try {
      for (const category of fullCategories) {
        setStatusMessage(`Loading ${category}...`);
        setProgress((completed / totalUnits) * 100);
        await loadCategory(category);
        completed += 1;
        setProgress((completed / totalUnits) * 100);
      }

      if (priorityPhonePaths.length > 0) {
        setStatusMessage('Loading flagship phones...');
        setProgress((completed / totalUnits) * 100);
        let phonesDone = 0;
        await mapPool(
          priorityPhonePaths,
          CATEGORY_LOAD_CONCURRENCY,
          async (path) => {
            await loadDevice(path);
            phonesDone += 1;
            const phoneFraction = phonesDone / priorityPhonePaths.length;
            setProgress(((completed + phoneFraction) / totalUnits) * 100);
          },
        );
        completed += 1;
        setProgress((completed / totalUnits) * 100);
      }

      setStatusMessage('Almost ready...');
      setProgress(100);
    } finally {
      setIsLoading(false);
      setStatusMessage(null);
    }
  }, [isLoading, loadedCategories, loadCategory, loadDevice]);

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
          setStatusMessage(`Loading ${order[i]}...`);
          setProgress((i / order.length) * 100);
          await loadCategory(order[i]);
          setProgress(((i + 1) / order.length) * 100);
        }
        setStatusMessage('Almost ready...');
      } finally {
        setIsLoading(false);
        setStatusMessage(null);
      }
    },
    [isLoading, loadedCategories, loadCategory],
  );

  const loadCategoriesForPreset = useCallback(
    async (preset: { items: { catalogFile: string }[] }) => {
      const neededPaths = preset.items.map((slot) => {
        const catalogFile = slot.catalogFile;
        const match = Object.values(metadataCatalog)
          .flat()
          .find((d) => d.catalogFile === catalogFile);
        return match?.path ?? null;
      });

      const uniquePaths = [...new Set(neededPaths.filter((p): p is string => p != null))];
      if (uniquePaths.length === 0) {
        // Fallback: load whole categories mentioned by the preset.
        const needed = new Set(
          preset.items.map((slot) => slot.catalogFile.split('/')[0]),
        );
        const pending = [...needed].filter((c) => !loadedCategories.has(c));
        if (pending.length === 0) return;
        setIsLoading(true);
        setProgress(0);
        try {
          for (let i = 0; i < pending.length; i++) {
            setStatusMessage(`Loading ${pending[i]}...`);
            setProgress((i / pending.length) * 100);
            await loadCategory(pending[i]);
            setProgress(((i + 1) / pending.length) * 100);
          }
          setStatusMessage('Almost ready...');
        } finally {
          setIsLoading(false);
          setStatusMessage(null);
        }
        return;
      }

      setIsLoading(true);
      setProgress(0);
      setStatusMessage('Loading devices for layout...');
      try {
        let done = 0;
        await mapPool(uniquePaths, CATEGORY_LOAD_CONCURRENCY, async (path) => {
          await loadDevice(path);
          done += 1;
          setProgress((done / uniquePaths.length) * 100);
        });
        setStatusMessage('Almost ready...');
      } finally {
        setIsLoading(false);
        setStatusMessage(null);
      }
    },
    [loadedCategories, loadCategory, loadDevice],
  );

  return {
    groupedLibrary,
    categories,
    loadedCategories,
    loadingDevicePaths,
    isLoading,
    progress,
    statusMessage,
    loadLibrary,
    loadPriorityLibrary,
    loadCategory,
    loadDevice,
    loadCategoriesForPreset,
  };
}
