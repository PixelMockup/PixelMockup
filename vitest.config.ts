import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setupTests.ts'],
    include: [
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'tests/components/**/*.{test,spec}.{ts,tsx}',
      'tests/accessibility/**/*.{test,spec}.{ts,tsx}',
      'tests/integration/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    css: true,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/storage.ts',
        'src/canvasZOrder.ts',
        'src/artboardSnap.ts',
        'src/deviceMeta.ts',
        'src/deviceScale.ts',
        'src/keybindings.ts',
        'src/layoutPresets.ts',
        'src/snapHaptics.ts',
        'src/useTheme.ts',
        'src/useKeybindings.ts',
        'src/ContextMenu.tsx',
      ],
      exclude: ['**/*.d.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
