import { vi } from 'vitest';

export function mockLocalStorage() {
  const store = new Map<string, string>();
  const api = {
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear()),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: api,
  });
  return { store, api };
}

export function stubCreateObjectURL() {
  const createObjectURL = vi.fn(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL,
    revokeObjectURL,
  });
  return { createObjectURL, revokeObjectURL };
}
