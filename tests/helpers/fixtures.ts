import type { DeviceItem } from '../../src/App';

export function makeDevice(
  overrides: Partial<DeviceItem> & Pick<DeviceItem, 'catalogFile' | 'name'>,
): DeviceItem {
  const catalogFile = overrides.catalogFile;
  return {
    path: overrides.path ?? `./assets/device_library/${catalogFile}`,
    src: overrides.src ?? `https://example.test/${catalogFile}`,
    name: overrides.name,
    category: overrides.category ?? 'phones',
    catalogFile,
    modelKey: overrides.modelKey ?? catalogFile.replace(/\.svg$/i, ''),
    widthMm: overrides.widthMm ?? 75,
    heightMm: overrides.heightMm ?? 150,
    brand: overrides.brand ?? 'Apple',
    productFamily: overrides.productFamily ?? 'iPhone 11',
  };
}

export function makeZItems(ids: string[]) {
  return ids.map((instanceId, zIndex) => ({ instanceId, zIndex }));
}
