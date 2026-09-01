import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { websiteCapturePlugin } from './scripts/websiteCapturePlugin.js';
import { apiPlugin } from './scripts/apiPlugin.js';

/** Loopback by default; Docker/set HOST=0.0.0.0 to listen on all interfaces. */
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT);
const previewPort = Number.isFinite(port) && port > 0 ? port : 4173;

// https://vite.dev/config/
export default defineConfig({
  server: {
    host,
    ...(Number.isFinite(port) && port > 0 ? { port } : {}),
  },
  preview: { host, port: previewPort },
  plugins: [react(), websiteCapturePlugin(), apiPlugin()],
});
