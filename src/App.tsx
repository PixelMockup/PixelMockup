import MockupStudio from './MockupStudio';

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
}

const groupByCategory = Object.entries(device_library).reduce<
  Record<string, DeviceItem[]>
>((acc, [path, src]) => {
  const pathParts = path.split('/');
  const category = pathParts[pathParts.length - 2] ?? 'uncategorized';
  const fileName = pathParts.pop()?.replace('.svg', '');

  if (!acc[category]) {
    acc[category] = [];
  }

  acc[category].push({
    path,
    src: src as string,
    name: fileName,
    category,
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

function App() {
  return (
    <div style={{ height: '100%', width: '100%', minHeight: 0 }}>
      <MockupStudio groupedLibrary={groupByCategory} />
    </div>
  );
}

export default App;
