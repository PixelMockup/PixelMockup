import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { presencePlugin } from './scripts/presencePlugin.js';
import { websiteCapturePlugin } from './scripts/websiteCapturePlugin.js';

// https://vite.dev/config/
export default defineConfig({
  // Keep the capture sidecar loopback-only by default.
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  plugins: [react(), websiteCapturePlugin(), presencePlugin()],
});
