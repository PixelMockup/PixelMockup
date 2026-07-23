import MockupStudio from './MockupStudio';
import deviceDimensions from './data/device_dimensions.json';
import { parseBrand, parseProductFamily } from './deviceMeta';

// Load the SVGs
const device_library = import.meta.glob('./assets/device_library/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export interface DeviceItem {
  path: string;
  src: string;
  name: string | undefined;
  category: string;
  /** Catalog file key, e.g. phones/Apple iPhone 11 Black.svg */
  catalogFile: string;
  modelKey: string;
  widthMm: number | undefined;
  heightMm: number | undefined;
  brand: string;
  productFamily: string;
}

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
  // ./assets/device_library/phones/Foo.svg → phones/Foo.svg
  const marker = '/device_library/';
  const idx = path.replace(/\\/g, '/').indexOf(marker);
  if (idx >= 0) return path.slice(idx + marker.length);
  const parts = path.split('/');
  const file = parts.pop() ?? '';
  const category = parts.pop() ?? 'uncategorized';
  return `${category}/${file}`;
}

const groupByCategory = Object.entries(device_library).reduce<
  Record<string, DeviceItem[]>
>((acc, [path, src]) => {
  const pathParts = path.split('/');
  const category = pathParts[pathParts.length - 2] ?? 'uncategorized';
  const fileName = pathParts.pop()?.replace('.svg', '');
  const catalogFile = catalogKeyFromGlobPath(path);
  const dim = dimByFile.get(catalogFile);
  const brand = parseBrand(fileName);
  const productFamily = parseProductFamily(fileName, category);

  if (!acc[category]) {
    acc[category] = [];
  }

  acc[category].push({
    path,
    src: src as string,
    name: fileName,
    category,
    catalogFile,
    modelKey: dim?.model_key ?? '',
    widthMm: dim?.width_mm ?? undefined,
    heightMm: dim?.height_mm ?? undefined,
    brand,
    productFamily,
  });

  return acc;
}, {});

// Stable alphabetical order within each category
for (const category of Object.keys(groupByCategory)) {
  groupByCategory[category].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, {
      sensitivity: 'base',
    }),
  );
}

// Dev aid: log any assets missing from the mm catalog
const missing = Object.values(groupByCategory)
  .flat()
  .filter((d) => d.widthMm == null || d.heightMm == null);
if (missing.length > 0) {
  console.warn(
    `[Mockup Studio] ${missing.length} assets missing mm dimensions:`,
    missing.map((d) => d.catalogFile),
  );
}

function App() {
  return <MockupStudio groupedLibrary={groupByCategory} />;
}

export default App;
