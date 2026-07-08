import { useState } from 'react';
import MockupStudio from './MockupStudio';

// Load the SVGs
const device_library = import.meta.glob('./assets/device_library/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
});

// Export the interface so we can use it in the other file
export interface DeviceItem {
  path: string;
  src: string;
  name: string | undefined;
}

// 2. Group them by category
const groupByCategory = Object.entries(device_library).reduce<Record<string, DeviceItem[]>>((acc, [path, src]) => {
  const pathParts = path.split('/'); // Assuming the category is the 4th segment in the path
  const category = pathParts[pathParts.length - 2]; // Default to 'uncategorized' if no category is found
  const fileName = pathParts.pop()?.replace('.svg', ''); // Get the file name without extension

  if (!acc[category]) {
    acc[category] = [];
  }

  // TypeScript might complain about 'src' being type 'unknown'. 
  // You can safely tell it 'src as string' here.
  acc[category].push({ path, src: src as string, name: fileName });

  return acc;
}, {});

function DeviceLibrary() {
  return (
    <div>
      {Object.entries(groupByCategory).map(([category, items]) => (
        <div key={category}>
          <h3>{category}</h3>{/*Render s 'phone', 'watches', 'laptops'*/}
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {items.map((item) => (
              <img
                src={item.src}
                key={item.path}
                alt={item.name}
                style={{
                  width: '100px',
                  height: '100px',
                  margin: '10px',
                  objectFit: 'contain',
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function App() {
  return (
    <>
      <MockupStudio groupedLibrary={groupByCategory} />
    </>
  )
}

export default App;